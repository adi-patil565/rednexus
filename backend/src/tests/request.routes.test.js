// Request lifecycle integration tests.
//
// This file is Phase 5's done-when condition, written as tests:
//
//   "a simulated threshold breach produces a DETECTED request that does
//    not notify anyone until a test user explicitly confirms it, after
//    which the full cycle (notify -> accept -> confirm -> close) works
//    end-to-end."
//
// The first half carries the product's central promise. If the "notifies
// nobody" assertions ever pass while the gate is broken, the platform is
// contacting donors on a computer's say-so.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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
const INST = 'mgm_kamothe';
const as = (uid) => ({ 'x-test-uid': uid });

const DONOR_IDS = ['req-donor-1', 'req-donor-2', 'req-donor-3'];

const cleanup = async () => {
  await prisma.notificationLog.deleteMany({ where: { donorId: { in: DONOR_IDS } } });
  await prisma.request.deleteMany({ where: { institutionId: INST } });
  await prisma.donor.deleteMany({ where: { id: { in: DONOR_IDS } } });
};

beforeAll(async () => {
  const staff = await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } });
  if (!staff) throw new Error('Fixtures missing. Run: npm run db:seed');
});

beforeEach(async () => {
  await cleanup();
  // Three eligible O+ donors in the institution's own pincode.
  await prisma.donor.createMany({
    data: DONOR_IDS.map((id, i) => ({
      id,
      firebaseUid: `fb-${id}`,
      name: `Request Donor ${i + 1}`,
      gender: 'MALE',
      dateOfBirth: new Date('1990-01-01'),
      phone: `98000001${i}0`,
      areaPincode: '410209',
      bloodGroupSelfReported: 'O_POS',
      bloodGroupVerified: 'O_POS',
      status: 'ACTIVE',
      lastDonationDate: new Date('2025-01-01'),
      priorDonationCount: 3,
      consentAt: new Date(),
      consentPurpose: 'test',
    })),
  });

  // A confirmed threshold far above stock, so detection must fire.
  await prisma.bloodGroupThreshold.upsert({
    where: { institutionId_bloodGroup: { institutionId: INST, bloodGroup: 'O_POS' } },
    update: { confirmedThreshold: 99999, confirmedCollectionTarget: 100 },
    create: {
      institutionId: INST,
      bloodGroup: 'O_POS',
      proposedThreshold: 99999,
      proposedCollectionTarget: 100,
      meanDailyUsage: 20,
      stdDevDailyUsage: 5,
      computationBasis: 'test fixture',
      daysOfData: 28,
      windowDays: 28,
      confidence: 'HIGH',
      confirmedThreshold: 99999,
      confirmedCollectionTarget: 100,
      confirmedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.bloodGroupThreshold.deleteMany({ where: { institutionId: INST } });
  await prisma.$disconnect();
});

const detect = () => request(app).post('/api/requests/detect').set(as(MGM_STAFF));

describe('T5 detection — drafts only', () => {
  it('creates a DETECTED request for a breached blood group', async () => {
    const res = await detect();
    expect(res.status).toBe(200);
    expect(res.body.drafted).toBeGreaterThan(0);
    expect(res.body.requests[0].state).toBe('DETECTED');
    expect(res.body.requests[0].origin).toBe('THRESHOLD_BREACH');
  });

  it('★ notifies NOBODY — this is the whole promise', async () => {
    await detect();
    const notifications = await prisma.notificationLog.count();
    expect(notifications).toBe(0);
  });

  it('explains itself in plain language for the approval screen', async () => {
    const res = await detect();
    const basis = res.body.requests[0].basis;
    expect(basis).toContain('O+');
    expect(basis).toContain('minimum');
    // Rules section 7: no jargon.
    expect(basis).not.toMatch(/threshold breach|T5|z-score/i);
  });

  it('does not pile up duplicate drafts for the same shortfall', async () => {
    await detect();
    const second = await detect();
    expect(second.body.drafted).toBe(0);
  });

  it('records the numbers that triggered it, not numbers that moved since', async () => {
    const res = await detect();
    expect(res.body.requests[0].thresholdAtDetection).toBe(99999);
    expect(res.body.requests[0].stockAtDetection).toBeGreaterThanOrEqual(0);
  });
});

describe('★ the confirmation gate', () => {
  it('refuses to notify a DETECTED request', async () => {
    const { body } = await detect();
    const id = body.requests[0].id;

    const res = await request(app).post(`/api/requests/${id}/notify`).set(as(MGM_STAFF));

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('not been confirmed');
    expect(await prisma.notificationLog.count()).toBe(0);
  });

  it('refuses confirmation from another institution', async () => {
    const { body } = await detect();
    const res = await request(app)
      .post(`/api/requests/${body.requests[0].id}/confirm`)
      .set(as(FORTIS_STAFF))
      .send({});
    // Fortis is unverified, so it never reaches the ownership check.
    expect(res.status).toBe(403);
  });

  it('★ records WHO confirmed and WHEN', async () => {
    const { body } = await detect();
    const id = body.requests[0].id;

    const res = await request(app).post(`/api/requests/${id}/confirm`).set(as(MGM_STAFF)).send({});
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('RAISED');

    const row = await prisma.request.findUnique({
      where: { id },
      include: { confirmedBy: true },
    });
    expect(row.confirmedByUserId).not.toBeNull();
    expect(row.confirmedBy.role).toBe('BLOOD_BANK_STAFF');
    expect(row.confirmedAt).toBeInstanceOf(Date);
  });

  it('lets staff adjust the number of units before approving', async () => {
    const { body } = await detect();
    const res = await request(app)
      .post(`/api/requests/${body.requests[0].id}/confirm`)
      .set(as(MGM_STAFF))
      .send({ unitsNeeded: 4, urgent: true });
    expect(res.body.unitsNeeded).toBe(4);
    expect(res.body.urgent).toBe(true);
  });

  it('cannot confirm the same request twice', async () => {
    const { body } = await detect();
    const id = body.requests[0].id;
    await request(app).post(`/api/requests/${id}/confirm`).set(as(MGM_STAFF)).send({});
    const second = await request(app).post(`/api/requests/${id}/confirm`).set(as(MGM_STAFF)).send({});
    expect(second.status).toBe(409);
  });
});

describe('full cycle after approval', () => {
  const raise = async () => {
    const { body } = await detect();
    const id = body.requests[0].id;
    await request(app).post(`/api/requests/${id}/confirm`).set(as(MGM_STAFF)).send({ unitsNeeded: 2 });
    return id;
  };

  it('notify -> accept -> confirm -> arrive -> donate -> close', async () => {
    const id = await raise();

    const notified = await request(app).post(`/api/requests/${id}/notify`).set(as(MGM_STAFF));
    expect(notified.status).toBe(200);
    expect(notified.body.notified).toBeGreaterThan(0);

    const accept = await request(app)
      .post(`/api/requests/${id}/respond`)
      .set(as('fb-req-donor-1'))
      .send({ accept: true });
    expect(accept.status).toBe(200);
    expect(accept.body.requestState).toBe('ACCEPTED');

    for (const to of ['CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED']) {
      const res = await request(app)
        .post(`/api/requests/${id}/transition`)
        .set(as(MGM_STAFF))
        .send({ to });
      expect(res.status).toBe(200);
      expect(res.body.state).toBe(to);
    }
  });

  it('★ rejects RAISED -> DONATED through the API, not just the library', async () => {
    const id = await raise();
    const res = await request(app)
      .post(`/api/requests/${id}/transition`)
      .set(as(MGM_STAFF))
      .send({ to: 'DONATED' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ILLEGAL_TRANSITION');
  });

  it('never contacts the same donor twice for one request', async () => {
    const id = await raise();
    await request(app).post(`/api/requests/${id}/notify`).set(as(MGM_STAFF));
    await request(app).post(`/api/requests/${id}/notify`).set(as(MGM_STAFF));

    const logs = await prisma.notificationLog.findMany({ where: { requestId: id } });
    expect(new Set(logs.map((l) => l.donorId)).size).toBe(logs.length);
  });

  it('records a rank score for later model comparison', async () => {
    const id = await raise();
    await request(app).post(`/api/requests/${id}/notify`).set(as(MGM_STAFF));
    const log = await prisma.notificationLog.findFirst({ where: { requestId: id } });
    expect(Number(log.rankScore)).toBeGreaterThan(0);
  });

  it('a donor cannot answer the same request twice', async () => {
    const id = await raise();
    await request(app).post(`/api/requests/${id}/notify`).set(as(MGM_STAFF));
    await request(app).post(`/api/requests/${id}/respond`).set(as('fb-req-donor-1')).send({ accept: true });
    const second = await request(app)
      .post(`/api/requests/${id}/respond`)
      .set(as('fb-req-donor-1'))
      .send({ accept: false });
    expect(second.status).toBe(409);
  });
});

describe('★ F7 — donor contact exposure', () => {
  it('shows contact details ONLY for donors who accepted', async () => {
    const { body } = await detect();
    const id = body.requests[0].id;
    await request(app).post(`/api/requests/${id}/confirm`).set(as(MGM_STAFF)).send({ unitsNeeded: 3 });
    await request(app).post(`/api/requests/${id}/notify`).set(as(MGM_STAFF));
    await request(app).post(`/api/requests/${id}/respond`).set(as('fb-req-donor-1')).send({ accept: true });

    const detail = await request(app).get(`/api/requests/${id}`).set(as(MGM_STAFF));
    expect(detail.status).toBe(200);

    const accepted = detail.body.donors.filter((d) => d.response === 'ACCEPTED');
    const pending = detail.body.donors.filter((d) => d.response === 'PENDING');

    expect(accepted[0].phone).toBeDefined();
    // Everyone else is an id and a status. Being asked is not consent
    // to hand over your phone number.
    for (const d of pending) {
      expect(d.phone).toBeUndefined();
      expect(d.name).toBeUndefined();
    }
  });

  it('refuses request detail to another institution', async () => {
    const { body } = await detect();
    const res = await request(app).get(`/api/requests/${body.requests[0].id}`).set(as(FORTIS_STAFF));
    expect(res.status).toBe(403);
  });
});

describe('manual requests', () => {
  it('enter directly at RAISED — a human already initiated them', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(as(MGM_STAFF))
      .send({ bloodGroup: 'A_NEG', unitsNeeded: 2, urgent: true, reason: 'Road accident, theatre 2' });

    expect(res.status).toBe(201);
    expect(res.body.state).toBe('RAISED');
    expect(res.body.origin).toBe('MANUAL');
    expect(res.body.basis).toContain('Road accident');
  });

  it('are still recorded against the staff member who raised them', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(as(MGM_STAFF))
      .send({ bloodGroup: 'B_NEG', unitsNeeded: 1, reason: 'Emergency surgery' });

    const row = await prisma.request.findUnique({ where: { id: res.body.id } });
    expect(row.confirmedByUserId).not.toBeNull();
  });

  it('require a reason', async () => {
    const res = await request(app)
      .post('/api/requests')
      .set(as(MGM_STAFF))
      .send({ bloodGroup: 'O_POS', unitsNeeded: 1 });
    expect(res.status).toBe(400);
  });
});
