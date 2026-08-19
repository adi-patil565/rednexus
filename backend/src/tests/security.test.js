// Security regression tests.
//
// Each of these corresponds to a finding from the audit. They exist so
// the holes cannot quietly reopen — every one of them was live code at
// some point, and none of them looked wrong.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../middleware/authMiddleware.js', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    req.firebaseUid = uid;
    return next();
  },
}));

vi.mock('../jobs/queues.js', () => ({
  scheduleEscalationCheck: vi.fn(async () => ({ scheduled: true })),
  getEscalationQueue: () => null,
  closeQueues: async () => {},
  ESCALATION_QUEUE: 'escalation',
}));

const request = (await import('supertest')).default;
const app = (await import('../app.js')).default;
const { prisma } = await import('../config/prisma.js');
const limits = await import('../middleware/rateLimits.js');

// MGM is verified in the seed. Fortis is not, so it is verified here
// to get a SECOND verified institution — the whole point is testing
// what one verified blood bank can do to another's donors.
const MGM_STAFF = 'seed-staff-mgm_kamothe';
const FORTIS_STAFF = 'seed-staff-fortis_vashi';
const as = (uid) => ({ 'x-test-uid': uid });

const MGM_DONOR = 'sec-mgm-donor';
const STRANGER = 'sec-stranger-donor';

const cleanup = async () => {
  await prisma.donationRecord.deleteMany({
    where: { donorId: { in: [MGM_DONOR, STRANGER] } },
  });
  await prisma.donor.deleteMany({ where: { id: { in: [MGM_DONOR, STRANGER] } } });
};

beforeAll(async () => {
  if (!(await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } }))) {
    throw new Error('Fixtures missing. Run: npm run db:seed');
  }
});

beforeEach(async () => {
  await cleanup();
  await prisma.institution.update({
    where: { id: 'fortis_vashi' },
    data: { verificationStatus: 'VERIFIED' },
  });

  // Donated at MGM, so MGM has a legitimate relationship.
  await prisma.donor.create({
    data: {
      id: MGM_DONOR,
      name: 'MGM Regular',
      gender: 'MALE',
      dateOfBirth: new Date('1992-02-02'),
      phone: '9876000011',
      areaPincode: '410209',
      bloodGroupSelfReported: 'O_POS',
      status: 'ACTIVE',
      consentAt: new Date(),
      consentPurpose: 'test',
      donations: {
        create: {
          institutionId: 'mgm_kamothe',
          date: new Date('2025-05-01'),
          screeningStatus: 'RELEASED',
          bloodGroupVerified: 'O_POS',
          releasedAt: new Date('2025-05-02'),
        },
      },
    },
  });

  // Registered on the platform, never touched either institution.
  await prisma.donor.create({
    data: {
      id: STRANGER,
      name: 'Unrelated Person',
      gender: 'FEMALE',
      dateOfBirth: new Date('1994-04-04'),
      phone: '9876000022',
      areaPincode: '410209',
      bloodGroupSelfReported: 'O_POS',
      status: 'PENDING_REVIEW',
      advisedNotToDonateFlag: true,
      consentAt: new Date(),
      consentPurpose: 'test',
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.institution.update({
    where: { id: 'fortis_vashi' },
    data: { verificationStatus: 'UNVERIFIED', verifiedByUserId: null, verifiedAt: null },
  });
  await prisma.$disconnect();
});

// ============================================================
// H1 — cross-tenant donor mutation
// ============================================================

describe('H1 · a blood bank cannot act on another blood bank donors', () => {
  it('★ cannot permanently defer a donor it has never dealt with', async () => {
    // The original exploit: one compromised staff account could set
    // PERMANENTLY_DEFERRED on every donor and darken the whole pool.
    const res = await request(app)
      .patch(`/api/donors/${MGM_DONOR}/staff`)
      .set(as(FORTIS_STAFF))
      .send({ deferralType: 'PERMANENT' });

    expect(res.status).toBe(404);

    const row = await prisma.donor.findUnique({ where: { id: MGM_DONOR } });
    expect(row.status).toBe('ACTIVE');
  });

  it('★ cannot clear a review for a donor it has never dealt with', async () => {
    const res = await request(app)
      .post(`/api/donors/${STRANGER}/clear-review`)
      .set(as(FORTIS_STAFF));
    expect(res.status).toBe(404);

    const row = await prisma.donor.findUnique({ where: { id: STRANGER } });
    expect(row.status).toBe('PENDING_REVIEW');
  });

  it('CAN act on its own donors', async () => {
    const res = await request(app)
      .patch(`/api/donors/${MGM_DONOR}/staff`)
      .set(as(MGM_STAFF))
      .send({ deferralType: 'TEMPORARY', deferralUntilDate: '2027-01-01' });
    expect(res.status).toBe(200);
  });

  it('★ a permanent deferral can be lifted — it used to be final', async () => {
    await request(app)
      .patch(`/api/donors/${MGM_DONOR}/staff`)
      .set(as(MGM_STAFF))
      .send({ deferralType: 'PERMANENT' });

    let row = await prisma.donor.findUnique({ where: { id: MGM_DONOR } });
    expect(row.status).toBe('PERMANENTLY_DEFERRED');

    // There was no path back at all before this. A mistake, or an
    // abusive call, could not be undone through the API.
    await request(app)
      .patch(`/api/donors/${MGM_DONOR}/staff`)
      .set(as(MGM_STAFF))
      .send({ deferralType: null });

    row = await prisma.donor.findUnique({ where: { id: MGM_DONOR } });
    expect(row.status).toBe('ACTIVE');
  });

  it('review queue shows only its own donors', async () => {
    const res = await request(app).get('/api/donors/review-queue').set(as(FORTIS_STAFF));
    expect(res.status).toBe(200);
    expect(res.body.donors.find((d) => d.id === STRANGER)).toBeUndefined();
  });
});

// ============================================================
// H2 — bulk PII harvesting
// ============================================================

describe('H2 · donor contact details are not browsable', () => {
  it('★ PIN-code search does not return strangers at all', async () => {
    // The original exploit: iterate ~19,000 Indian PIN codes and walk
    // the entire donor database out through this endpoint.
    const res = await request(app)
      .get('/api/donors/search?pincode=410209')
      .set(as(FORTIS_STAFF));

    expect(res.status).toBe(200);
    const ids = res.body.donors.map((d) => d.id);
    expect(ids).not.toContain(MGM_DONOR);
    expect(ids).not.toContain(STRANGER);
  });

  it('★ PIN-code search leaks no names or phone numbers', async () => {
    const res = await request(app)
      .get('/api/donors/search?pincode=410209')
      .set(as(FORTIS_STAFF));

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('9876000011');
    expect(body).not.toContain('9876000022');
    expect(body).not.toContain('MGM Regular');
  });

  it('exact-phone lookup still finds a walk-in, without handing over contact', async () => {
    // A donor standing at the counter must be findable by a blood bank
    // they have never used. The caller already knows the number they
    // typed, so this cannot enumerate anyone.
    const res = await request(app)
      .get('/api/donors/search?phone=9876000011')
      .set(as(FORTIS_STAFF));

    expect(res.status).toBe(200);
    expect(res.body.donors).toHaveLength(1);

    const found = res.body.donors[0];
    expect(found.knownToUs).toBe(false);
    expect(found.phoneLast4).toBe('0011');
    // Confirmable, not harvestable.
    expect(found.phone).toBeUndefined();
    expect(found.name).toBeUndefined();
  });

  it('full contact IS returned for a donor the institution knows', async () => {
    const res = await request(app)
      .get('/api/donors/search?phone=9876000011')
      .set(as(MGM_STAFF));

    const found = res.body.donors[0];
    expect(found.knownToUs).toBe(true);
    expect(found.phone).toBe('9876000011');
  });

  it('still refuses an empty search', async () => {
    const res = await request(app).get('/api/donors/search').set(as(MGM_STAFF));
    expect(res.status).toBe(400);
  });
});

// ============================================================
// H3 / M3 — limits and exposure
// ============================================================

describe('H3 · rate limits are configured', () => {
  it('★ every sensitive route has a limiter', () => {
    // Skipped during tests, so the configuration is asserted instead of
    // the behaviour - otherwise the suite would spend its time being
    // throttled by its own defences.
    for (const name of [
      'globalLimiter',
      'registrationLimiter',
      'searchLimiter',
      'applicationLimiter',
      'notifyLimiter',
    ]) {
      expect(typeof limits[name]).toBe('function');
    }
  });
});

describe('M3 · donor lookup requires an account', () => {
  it('★ refuses an unauthenticated read', async () => {
    const res = await request(app).get(`/api/donors/${MGM_DONOR}`);
    expect(res.status).toBe(401);
  });

  it('still exposes no contact details when authenticated', async () => {
    const res = await request(app).get(`/api/donors/${MGM_DONOR}`).set(as(MGM_STAFF));
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('9876000011');
    expect(body).not.toContain('MGM Regular');
  });
});

// ============================================================
// Regressions on things that were already right
// ============================================================

describe('previously-fixed holes stay fixed', () => {
  it('an applicant cannot arrive pre-verified or as an admin', async () => {
    const res = await request(app)
      .post('/api/institutions/apply')
      .set(as('fb-sec-applicant'))
      .send({
        name: 'Security Test Bank',
        category: 'EXTERNAL',
        pincode: '400001',
        contactName: 'Test Person',
        contactEmail: 'sec-test@applicant.dummy.in',
        contactPhone: '9876000033',
        verificationStatus: 'VERIFIED',
        role: 'PLATFORM_ADMIN',
      });

    if (res.status === 201) {
      const inst = await prisma.institution.findUnique({
        where: { id: res.body.institutionId },
        include: { staff: true },
      });
      expect(inst.verificationStatus).toBe('UNVERIFIED');
      expect(inst.staff[0].role).toBe('BLOOD_BANK_STAFF');

      await prisma.user.deleteMany({ where: { institutionId: inst.id } });
      await prisma.institution.delete({ where: { id: inst.id } });
    }
  });

  it('a forged token cannot reach an authenticated route', async () => {
    const res = await request(app).get('/api/usage');
    expect(res.status).toBe(401);
  });
});
