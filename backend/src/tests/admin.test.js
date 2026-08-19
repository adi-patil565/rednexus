// Platform admin and staff donor-management tests.
//
// These paths were hardcoded mocks until now, and one of them -
// PUT /api/admin/institutions/:id/verify - accepted an unauthenticated
// request and echoed back a success. Institution verification is the
// gate on every donor-facing action in the product, so the first thing
// asserted here is that it can no longer be called by anyone.

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

const ADMIN = 'seed-platform-admin';
const MGM_STAFF = 'seed-staff-mgm_kamothe';
const FORTIS_STAFF = 'seed-staff-fortis_vashi';
const as = (uid) => ({ 'x-test-uid': uid });

const REVIEW_DONOR = 'admin-test-review-donor';
const ORPHAN_INST = 'admin-test-orphan-institution';

beforeAll(async () => {
  if (!(await prisma.user.findUnique({ where: { firebaseUid: ADMIN } }))) {
    throw new Error('Fixtures missing. Run: npm run db:seed');
  }
});

beforeEach(async () => {
  await prisma.donor.deleteMany({ where: { id: REVIEW_DONOR } });
  await prisma.donor.create({
    data: {
      id: REVIEW_DONOR,
      name: 'Review Queue Donor',
      gender: 'FEMALE',
      dateOfBirth: new Date('1997-06-01'),
      phone: '9811100011',
      areaPincode: '400703',
      bloodGroupSelfReported: 'AB_NEG',
      advisedNotToDonateFlag: true,
      status: 'PENDING_REVIEW',
      consentAt: new Date(),
      consentPurpose: 'test',
    },
  });

  // Reset Fortis to the state the seed leaves it in. Verifying it is
  // the point of several tests here, so without this the first one to
  // run leaks a VERIFIED institution into every test after it - which
  // is exactly what happened: two assertions expecting 403 got 200.
  await prisma.institution.update({
    where: { id: 'fortis_vashi' },
    data: { verificationStatus: 'UNVERIFIED', verifiedByUserId: null, verifiedAt: null },
  });

  // An institution with no staff, to test the go-live constraint.
  await prisma.institution.deleteMany({ where: { id: ORPHAN_INST } });
  await prisma.institution.create({
    data: {
      id: ORPHAN_INST,
      name: 'Orphan Blood Bank',
      category: 'EXTERNAL',
      pincode: '400001',
      verificationStatus: 'UNVERIFIED',
    },
  });
});

afterAll(async () => {
  await prisma.donor.deleteMany({ where: { id: REVIEW_DONOR } });
  await prisma.institution.deleteMany({ where: { id: ORPHAN_INST } });
  // Leave the seeded institutions as the seed left them.
  await prisma.institution.update({
    where: { id: 'fortis_vashi' },
    data: { verificationStatus: 'UNVERIFIED', verifiedByUserId: null, verifiedAt: null },
  });
  await prisma.$disconnect();
});

describe('★ admin routes are no longer open', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/admin/institutions');
    expect(res.status).toBe(401);
  });

  it('★ rejects blood bank staff — an institution cannot verify itself', async () => {
    // This is the whole point of separating the two roles.
    const res = await request(app)
      .post(`/api/admin/institutions/${ORPHAN_INST}/decision`)
      .set(as(MGM_STAFF))
      .send({ decision: 'VERIFIED' });
    expect(res.status).toBe(403);
  });

  it('★ staff cannot verify their OWN unverified institution', async () => {
    const res = await request(app)
      .post('/api/admin/institutions/fortis_vashi/decision')
      .set(as(FORTIS_STAFF))
      .send({ decision: 'VERIFIED' });
    expect(res.status).toBe(403);

    const row = await prisma.institution.findUnique({ where: { id: 'fortis_vashi' } });
    expect(row.verificationStatus).toBe('UNVERIFIED');
  });
});

describe('institution verification', () => {
  it('lists institutions awaiting review', async () => {
    const res = await request(app)
      .get('/api/admin/institutions?status=UNVERIFIED')
      .set(as(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.institutions.length).toBeGreaterThan(0);
  });

  it('★ refuses to verify a blood bank with no staff account', async () => {
    // Phase 3's done-when. Every threshold confirmation and alert
    // approval must be attributable to a named person; verifying an
    // institution with nobody to do that creates one that can never act.
    const res = await request(app)
      .post(`/api/admin/institutions/${ORPHAN_INST}/decision`)
      .set(as(ADMIN))
      .send({ decision: 'VERIFIED' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NO_STAFF_ACCOUNT');

    const row = await prisma.institution.findUnique({ where: { id: ORPHAN_INST } });
    expect(row.verificationStatus).toBe('UNVERIFIED');
  });

  it('allows REJECTING an institution with no staff', async () => {
    // The constraint guards going live, not saying no.
    const res = await request(app)
      .post(`/api/admin/institutions/${ORPHAN_INST}/decision`)
      .set(as(ADMIN))
      .send({ decision: 'REJECTED' });
    expect(res.status).toBe(200);
  });

  it('★ verifies an institution that has staff, recording who and when', async () => {
    const res = await request(app)
      .post('/api/admin/institutions/fortis_vashi/decision')
      .set(as(ADMIN))
      .send({ decision: 'VERIFIED' });

    expect(res.status).toBe(200);

    const row = await prisma.institution.findUnique({
      where: { id: 'fortis_vashi' },
      include: { verifiedBy: true },
    });
    expect(row.verificationStatus).toBe('VERIFIED');
    expect(row.verifiedBy.role).toBe('PLATFORM_ADMIN');
    expect(row.verifiedAt).toBeInstanceOf(Date);
  });

  it('★ verification actually unblocks the institution', async () => {
    // Before: Fortis staff are refused everywhere.
    const before = await request(app).get('/api/usage').set(as(FORTIS_STAFF));
    expect(before.status).toBe(403);

    await request(app)
      .post('/api/admin/institutions/fortis_vashi/decision')
      .set(as(ADMIN))
      .send({ decision: 'VERIFIED' });

    const after = await request(app).get('/api/usage').set(as(FORTIS_STAFF));
    expect(after.status).toBe(200);
  });

  it('rejects a decision that is neither VERIFIED nor REJECTED', async () => {
    const res = await request(app)
      .post('/api/admin/institutions/fortis_vashi/decision')
      .set(as(ADMIN))
      .send({ decision: 'MAYBE' });
    expect(res.status).toBe(400);
  });
});

describe('platform stats', () => {
  it('returns real counts rather than invented ones', async () => {
    const res = await request(app).get('/api/admin/stats').set(as(ADMIN));
    expect(res.status).toBe(200);

    const actualInstitutions = await prisma.institution.count();
    expect(res.body.institutions.total).toBe(actualInstitutions);

    const actualDonors = await prisma.donor.count();
    expect(res.body.donors.total).toBe(actualDonors);
  });

  it('counts donors awaiting review', async () => {
    const res = await request(app).get('/api/admin/stats').set(as(ADMIN));
    expect(res.body.donors.awaitingReview).toBeGreaterThan(0);
  });
});

describe('staff donor management', () => {
  it('lists the review queue', async () => {
    const res = await request(app).get('/api/donors/review-queue').set(as(MGM_STAFF));
    expect(res.status).toBe(200);
    expect(res.body.donors.some((d) => d.id === REVIEW_DONOR)).toBe(true);
  });

  it('refuses the review queue to an unverified institution', async () => {
    const res = await request(app).get('/api/donors/review-queue').set(as(FORTIS_STAFF));
    expect(res.status).toBe(403);
  });

  it('★ clearing a review makes the donor contactable', async () => {
    const res = await request(app)
      .post(`/api/donors/${REVIEW_DONOR}/clear-review`)
      .set(as(MGM_STAFF));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('cannot clear a donor who is not under review', async () => {
    await request(app).post(`/api/donors/${REVIEW_DONOR}/clear-review`).set(as(MGM_STAFF));
    const second = await request(app)
      .post(`/api/donors/${REVIEW_DONOR}/clear-review`)
      .set(as(MGM_STAFF));
    expect(second.status).toBe(409);
  });

  it('★ a permanent deferral removes the donor from the pool for good', async () => {
    await request(app)
      .patch(`/api/donors/${REVIEW_DONOR}/staff`)
      .set(as(MGM_STAFF))
      .send({ deferralType: 'PERMANENT' });

    const row = await prisma.donor.findUnique({ where: { id: REVIEW_DONOR } });
    expect(row.status).toBe('PERMANENTLY_DEFERRED');
    expect(row.deferralSetByUserId).not.toBeNull();
  });

  it('records a temporary deferral with a date and who set it', async () => {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + 45);

    await request(app)
      .patch(`/api/donors/${REVIEW_DONOR}/staff`)
      .set(as(MGM_STAFF))
      .send({ deferralType: 'TEMPORARY', deferralUntilDate: until.toISOString() });

    const row = await prisma.donor.findUnique({ where: { id: REVIEW_DONOR } });
    expect(row.deferralUntilDate).toBeInstanceOf(Date);
    expect(row.deferralSetByUserId).not.toBeNull();
  });

  it('★ stores no reason for a deferral', async () => {
    await request(app)
      .patch(`/api/donors/${REVIEW_DONOR}/staff`)
      .set(as(MGM_STAFF))
      .send({ deferralType: 'PERMANENT', reason: 'failed TTI screening' });

    const row = await prisma.donor.findUnique({ where: { id: REVIEW_DONOR } });
    // Why someone was deferred is a medical fact about a named person.
    // The schema has nowhere to put it, on purpose.
    expect(JSON.stringify(row)).not.toContain('TTI');
    expect(row.status).toBe('PERMANENTLY_DEFERRED');
  });

  it('search requires a term rather than dumping the donor list', async () => {
    const res = await request(app).get('/api/donors/search').set(as(MGM_STAFF));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('SEARCH_TERM_REQUIRED');
  });

  it('search by pincode returns matching donors', async () => {
    const res = await request(app).get('/api/donors/search?pincode=400703').set(as(MGM_STAFF));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.donors)).toBe(true);
  });
});
