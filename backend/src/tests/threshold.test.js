// Threshold engine tests (T2 / T3 / T4).
//
// Two halves:
//   1. The maths, as pure functions.
//   2. The GATE, against real Postgres fixtures.
//
// The second half carries the weight. Rules section 1 says no
// system-proposed threshold may take effect without an explicit
// confirming action from a named BLOOD_BANK_STAFF user, and that this
// is "not configurable". The tests below assert that a proposal sitting
// in the database is inert: it does not activate on read, it does not
// activate on recompute, and it is not treated as confirmed by breach
// detection.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  computeProposal,
  confidenceFor,
  checkBreach,
  REPLENISHMENT_LEAD_DAYS,
} from '../services/threshold.service.js';

// ============================================================
// Part 1 — the maths
// ============================================================

describe('computeProposal', () => {
  const steady = Array(28).fill(10); // exactly 10 units every day

  it('covers the replenishment lead time on perfectly steady demand', () => {
    const p = computeProposal(steady, 28);
    // No variance, so no safety buffer: 10/day x 3 days.
    expect(p.meanDailyUsage).toBe(10);
    expect(p.stdDevDailyUsage).toBe(0);
    expect(p.proposedThreshold).toBe(10 * REPLENISHMENT_LEAD_DAYS);
  });

  it('sets the weekly collection target to match consumption', () => {
    // The product's whole thesis: collection must equal consumption in
    // steady state, otherwise the drive-to-drive decline continues.
    expect(computeProposal(steady, 28).proposedCollectionTarget).toBe(70);
  });

  it('raises the threshold when demand is lumpier', () => {
    const lumpy = [0, 0, 35, 0, 0, 35, 0, 0, 35, 0, 0, 35, 0, 0]; // 140/14 = 10/day
    const steadyShort = Array(14).fill(10);

    const lumpyP = computeProposal(lumpy, 14);
    const steadyP = computeProposal(steadyShort, 14);

    expect(lumpyP.meanDailyUsage).toBeCloseTo(steadyP.meanDailyUsage, 0);
    expect(lumpyP.proposedThreshold).toBeGreaterThan(steadyP.proposedThreshold);
  });

  it('never proposes a zero threshold for a group with real demand', () => {
    // Zero would mean "do not alert until completely out".
    const p = computeProposal([1, 0, 0, 0, 0, 0, 1], 7);
    expect(p.proposedThreshold).toBeGreaterThan(0);
  });

  it('proposes zero for a group with genuinely no usage', () => {
    const p = computeProposal(Array(28).fill(0), 28);
    expect(p.proposedThreshold).toBe(0);
    expect(p.proposedCollectionTarget).toBe(0);
  });

  it('handles an empty series without dividing by zero', () => {
    const p = computeProposal([], 28);
    expect(p.proposedThreshold).toBe(0);
    expect(p.meanDailyUsage).toBe(0);
    expect(p.confidence).toBe('LOW');
  });

  it('states its basis in plain language with the numbers in it', () => {
    const p = computeProposal(steady, 28);
    expect(p.computationBasis).toContain('28 of the last 28 days');
    expect(p.computationBasis).toContain('10.0 units/day');
    // Rules section 7: no jargon in staff- or donor-facing text.
    expect(p.computationBasis).not.toMatch(/sigma|z-score|quantile|stdev/i);
  });
});

describe('confidenceFor', () => {
  it('is LOW on very little data but still returns a proposal', () => {
    expect(confidenceFor(3, 28)).toBe('LOW');
  });

  it('is MEDIUM on partial coverage', () => {
    expect(confidenceFor(10, 28)).toBe('MEDIUM');
  });

  it('is HIGH on near-complete coverage', () => {
    expect(confidenceFor(28, 28)).toBe('HIGH');
  });

  it('never throws on a zero window', () => {
    expect(confidenceFor(0, 0)).toBe('LOW');
  });
});

describe('checkBreach', () => {
  const confirmed = { bloodGroup: 'O_POS', confirmedThreshold: 20 };

  it('★ returns null when nothing is confirmed — a proposal is not a decision', () => {
    const proposalOnly = { bloodGroup: 'O_POS', proposedThreshold: 20, confirmedThreshold: null };
    expect(checkBreach(proposalOnly, 1)).toBeNull();
  });

  it('flags stock at the threshold — "at or below", not "below"', () => {
    expect(checkBreach(confirmed, 20).inBreach).toBe(true);
  });

  it('does not flag stock above the threshold', () => {
    expect(checkBreach(confirmed, 21).inBreach).toBe(false);
  });

  it('reports the shortfall', () => {
    expect(checkBreach(confirmed, 12).shortfall).toBe(8);
  });
});

// ============================================================
// Part 2 — the gate, against real fixtures
// ============================================================

vi.mock('../middleware/authMiddleware.js', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    req.firebaseUid = uid;
    return next();
  },
}));

const request = (await import('supertest')).default;
const app = (await import('../app.js')).default;
const { prisma } = await import('../config/prisma.js');

const MGM_STAFF = 'seed-staff-mgm_kamothe';
const FORTIS_STAFF = 'seed-staff-fortis_vashi';
const ADMIN = 'seed-platform-admin';
const as = (uid) => ({ 'x-test-uid': uid });

beforeAll(async () => {
  const staff = await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } });
  if (!staff) throw new Error('Fixtures missing. Run: npm run db:seed');
  // Start from a clean slate so "nothing is confirmed yet" is true.
  await prisma.bloodGroupThreshold.deleteMany({ where: { institutionId: 'mgm_kamothe' } });
});

afterAll(async () => {
  await prisma.bloodGroupThreshold.deleteMany({ where: { institutionId: 'mgm_kamothe' } });
  await prisma.$disconnect();
});

describe('GET /api/thresholds', () => {
  it('proposes for all eight blood groups from real usage', async () => {
    const res = await request(app).get('/api/thresholds?windowDays=28').set(as(MGM_STAFF));
    expect(res.status).toBe(200);
    expect(res.body.thresholds).toHaveLength(8);
  });

  it('★ proposals arrive INACTIVE — nothing is confirmed by being computed', async () => {
    const res = await request(app).get('/api/thresholds').set(as(MGM_STAFF));
    for (const t of res.body.thresholds) {
      expect(t.active).toBeNull();
      expect(t.needsConfirmation).toBe(true);
    }
  });

  it('★ recomputing never activates anything', async () => {
    await request(app).get('/api/thresholds').set(as(MGM_STAFF));
    await request(app).get('/api/thresholds?windowDays=14').set(as(MGM_STAFF));

    const active = await prisma.bloodGroupThreshold.count({
      where: { institutionId: 'mgm_kamothe', confirmedThreshold: { not: null } },
    });
    expect(active).toBe(0);
  });

  it('shows the basis for every number', async () => {
    const res = await request(app).get('/api/thresholds').set(as(MGM_STAFF));
    for (const t of res.body.thresholds) {
      expect(t.proposed.basis).toContain('days reported');
    }
  });

  it('proposes a real threshold for O- despite its small share', async () => {
    // The group a single "Negatives" bucket would have hidden.
    const res = await request(app).get('/api/thresholds').set(as(MGM_STAFF));
    const oNeg = res.body.thresholds.find((t) => t.bloodGroupValue === 'O_NEG');
    expect(oNeg.proposed.threshold).toBeGreaterThan(0);
  });

  it('refuses an unverified institution', async () => {
    const res = await request(app).get('/api/thresholds').set(as(FORTIS_STAFF));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/thresholds/:bloodGroup/confirm — the gate', () => {
  it('refuses a PLATFORM_ADMIN — only the institution confirms its own', async () => {
    const res = await request(app)
      .post('/api/thresholds/O_POS/confirm')
      .set(as(ADMIN))
      .send({ confirmedThreshold: 20, confirmedCollectionTarget: 70 });
    expect(res.status).toBe(403);
  });

  it('refuses an unverified institution', async () => {
    const res = await request(app)
      .post('/api/thresholds/O_POS/confirm')
      .set(as(FORTIS_STAFF))
      .send({ confirmedThreshold: 20, confirmedCollectionTarget: 70 });
    expect(res.status).toBe(403);
  });

  it('★ records WHO confirmed and WHEN', async () => {
    await request(app).get('/api/thresholds').set(as(MGM_STAFF));

    const res = await request(app)
      .post('/api/thresholds/O_POS/confirm')
      .set(as(MGM_STAFF))
      .send({ confirmedThreshold: 25, confirmedCollectionTarget: 80 });

    expect(res.status).toBe(200);

    const row = await prisma.bloodGroupThreshold.findUnique({
      where: { institutionId_bloodGroup: { institutionId: 'mgm_kamothe', bloodGroup: 'O_POS' } },
      include: { confirmedBy: true },
    });
    // Architecture.md section 3: this trail is the evidence the
    // human-in-the-loop guarantee is real rather than a UI label.
    expect(row.confirmedByUserId).not.toBeNull();
    expect(row.confirmedBy.role).toBe('BLOOD_BANK_STAFF');
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect(row.confirmedThreshold).toBe(25);
  });

  it('confirms ONE blood group, leaving the other seven inactive', async () => {
    const stillPending = await prisma.bloodGroupThreshold.count({
      where: { institutionId: 'mgm_kamothe', confirmedThreshold: null },
    });
    expect(stillPending).toBe(7);
  });

  it('flags an edited confirmation so a bad formula is visible', async () => {
    const before = await prisma.bloodGroupThreshold.findUnique({
      where: { institutionId_bloodGroup: { institutionId: 'mgm_kamothe', bloodGroup: 'B_POS' } },
    });

    const res = await request(app)
      .post('/api/thresholds/B_POS/confirm')
      .set(as(MGM_STAFF))
      .send({
        confirmedThreshold: before.proposedThreshold + 10, // staff override
        confirmedCollectionTarget: before.proposedCollectionTarget,
      });

    expect(res.status).toBe(200);
    expect(res.body.wasEdited).toBe(true);
  });

  it('does not flag an unedited confirmation', async () => {
    const before = await prisma.bloodGroupThreshold.findUnique({
      where: { institutionId_bloodGroup: { institutionId: 'mgm_kamothe', bloodGroup: 'A_POS' } },
    });

    const res = await request(app)
      .post('/api/thresholds/A_POS/confirm')
      .set(as(MGM_STAFF))
      .send({
        confirmedThreshold: before.proposedThreshold,
        confirmedCollectionTarget: before.proposedCollectionTarget,
      });

    expect(res.body.wasEdited).toBe(false);
  });

  it('rejects a negative threshold', async () => {
    const res = await request(app)
      .post('/api/thresholds/A_NEG/confirm')
      .set(as(MGM_STAFF))
      .send({ confirmedThreshold: -5, confirmedCollectionTarget: 10 });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown blood group', async () => {
    const res = await request(app)
      .post('/api/thresholds/Z_POS/confirm')
      .set(as(MGM_STAFF))
      .send({ confirmedThreshold: 5, confirmedCollectionTarget: 10 });
    expect(res.status).toBe(400);
  });

  it('★ a later recompute does not disturb a confirmed value', async () => {
    await request(app).get('/api/thresholds?windowDays=14').set(as(MGM_STAFF));

    const row = await prisma.bloodGroupThreshold.findUnique({
      where: { institutionId_bloodGroup: { institutionId: 'mgm_kamothe', bloodGroup: 'O_POS' } },
    });
    // The proposal may move; what staff approved must not.
    expect(row.confirmedThreshold).toBe(25);
  });
});

describe('GET /api/thresholds/breaches', () => {
  it('★ reports unconfirmed groups as unmonitored, not as healthy', async () => {
    const res = await request(app).get('/api/thresholds/breaches').set(as(MGM_STAFF));
    expect(res.status).toBe(200);
    // "No opinion" and "fine" must not look identical.
    expect(res.body.unmonitoredBloodGroups.length).toBeGreaterThan(0);
  });

  it('only ever considers confirmed thresholds', async () => {
    const res = await request(app).get('/api/thresholds/breaches').set(as(MGM_STAFF));
    const confirmed = await prisma.bloodGroupThreshold.findMany({
      where: { institutionId: 'mgm_kamothe', confirmedThreshold: { not: null } },
    });
    const monitored = confirmed.length;
    // Every group is either monitored or explicitly unmonitored.
    expect(res.body.unmonitoredBloodGroups.length).toBe(8 - monitored);
    // A breach can only come from a confirmed threshold.
    expect(res.body.breaches.length).toBeLessThanOrEqual(monitored);
  });

  it('creates no request — drafting is Phase 5, behind its own gate', async () => {
    const res = await request(app).get('/api/thresholds/breaches').set(as(MGM_STAFF));
    expect(res.body).not.toHaveProperty('requestId');
    expect(res.body).not.toHaveProperty('notified');
  });
});
