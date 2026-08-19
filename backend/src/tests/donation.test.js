// Donation recording, screening release, and effective stock.
//
// The behaviour under test: a donation affects the DONOR immediately
// (eligibility clock) but affects SUPPLY only once staff release it
// after screening. Counting it at donation time would tell the
// threshold engine that supply arrived before it is usable, suppressing
// an alert that is still needed.

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
const { getEffectiveStock } = await import('../services/stock.service.js');
const { computeEligibility } = await import('../services/eligibility.service.js');

const MGM_STAFF = 'seed-staff-mgm_kamothe';
const FORTIS_STAFF = 'seed-staff-fortis_vashi';
const INST = 'mgm_kamothe';
const as = (uid) => ({ 'x-test-uid': uid });

const TEST_DONOR = 'test-donation-donor';

beforeAll(async () => {
  const staff = await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } });
  if (!staff) throw new Error('Fixtures missing. Run: npm run db:seed');
});

beforeEach(async () => {
  await prisma.donationRecord.deleteMany({ where: { donorId: TEST_DONOR } });
  await prisma.donor.deleteMany({ where: { id: TEST_DONOR } });
  await prisma.donor.create({
    data: {
      id: TEST_DONOR,
      name: 'Test Donor',
      gender: 'MALE',
      dateOfBirth: new Date('1990-01-01'),
      phone: '9800000099',
      areaPincode: '410209',
      bloodGroupSelfReported: 'O_POS',
      donatedBefore: false,
      status: 'PROVISIONAL',
      consentAt: new Date(),
      consentPurpose: 'test',
    },
  });
});

afterAll(async () => {
  await prisma.donationRecord.deleteMany({ where: { donorId: TEST_DONOR } });
  await prisma.donor.deleteMany({ where: { id: TEST_DONOR } });
  await prisma.$disconnect();
});

const record = (body = {}) =>
  request(app)
    .post('/api/donations')
    .set(as(MGM_STAFF))
    .send({ donorId: TEST_DONOR, bloodGroupVerified: 'O_POS', ...body });

describe('POST /api/donations — donor side', () => {
  it('starts the eligibility clock immediately', async () => {
    const before = await prisma.donor.findUnique({ where: { id: TEST_DONOR } });
    expect(computeEligibility(before).eligible).toBe(true); // never donated

    await record();

    const after = await prisma.donor.findUnique({ where: { id: TEST_DONOR } });
    expect(after.lastDonationDate).not.toBeNull();
    // No recalculation job ran. Eligibility is computed on read, so
    // moving lastDonationDate IS the recalculation.
    expect(computeEligibility(after).eligible).toBe(false);
  });

  it('promotes a PROVISIONAL donor to ACTIVE on first donation', async () => {
    await record();
    const after = await prisma.donor.findUnique({ where: { id: TEST_DONOR } });
    expect(after.status).toBe('ACTIVE');
  });

  it('★ does NOT promote a donor held for review', async () => {
    // Donating is not the same as a human clearing the review flag.
    await prisma.donor.update({
      where: { id: TEST_DONOR },
      data: { status: 'PENDING_REVIEW', advisedNotToDonateFlag: true },
    });

    await record();

    const after = await prisma.donor.findUnique({ where: { id: TEST_DONOR } });
    expect(after.status).toBe('PENDING_REVIEW');
  });

  it('promotes the verified blood group over the self-reported claim', async () => {
    await record({ bloodGroupVerified: 'A_NEG' });
    const after = await prisma.donor.findUnique({ where: { id: TEST_DONOR } });
    expect(after.bloodGroupSelfReported).toBe('O_POS'); // the claim survives
    expect(after.bloodGroupVerified).toBe('A_NEG'); // the result wins
  });

  it('rejects an unknown donor', async () => {
    const res = await request(app)
      .post('/api/donations')
      .set(as(MGM_STAFF))
      .send({ donorId: 'no-such-donor' });
    expect(res.status).toBe(404);
  });

  it('refuses an unverified institution', async () => {
    const res = await request(app)
      .post('/api/donations')
      .set(as(FORTIS_STAFF))
      .send({ donorId: TEST_DONOR });
    expect(res.status).toBe(403);
  });
});

describe('screening — supply side', () => {
  it('★ a recorded donation is NOT stock until released', async () => {
    const created = await record();
    expect(created.body.screeningStatus).toBe('PENDING_SCREENING');

    const stock = await getEffectiveStock(prisma, INST);
    const before = stock.get('O_POS').releasedSince;
    expect(before).toBe(0);
  });

  it('★ releasing adds it to effective stock', async () => {
    const created = await record();

    const res = await request(app)
      .post(`/api/donations/${created.body.id}/release`)
      .set(as(MGM_STAFF))
      .send({ bloodGroupVerified: 'O_POS' });

    expect(res.status).toBe(200);

    const stock = await getEffectiveStock(prisma, INST);
    expect(stock.get('O_POS').releasedSince).toBe(1);
    expect(stock.get('O_POS').effective).toBe(
      stock.get('O_POS').counted + 1
    );
  });

  it('★ releasing twice does not double-count the same unit', async () => {
    const created = await record();

    await request(app)
      .post(`/api/donations/${created.body.id}/release`)
      .set(as(MGM_STAFF))
      .send({ bloodGroupVerified: 'O_POS' });

    const second = await request(app)
      .post(`/api/donations/${created.body.id}/release`)
      .set(as(MGM_STAFF))
      .send({ bloodGroupVerified: 'O_POS' });

    expect(second.status).toBe(409);

    const stock = await getEffectiveStock(prisma, INST);
    expect(stock.get('O_POS').releasedSince).toBe(1);
  });

  it('a discarded unit never becomes stock', async () => {
    const created = await record();

    await request(app).post(`/api/donations/${created.body.id}/discard`).set(as(MGM_STAFF)).send({});

    const stock = await getEffectiveStock(prisma, INST);
    expect(stock.get('O_POS').releasedSince).toBe(0);
  });

  it('a discarded unit cannot then be released', async () => {
    const created = await record();
    await request(app).post(`/api/donations/${created.body.id}/discard`).set(as(MGM_STAFF)).send({});

    const res = await request(app)
      .post(`/api/donations/${created.body.id}/release`)
      .set(as(MGM_STAFF))
      .send({ bloodGroupVerified: 'O_POS' });

    expect(res.status).toBe(409);
  });

  it('★ refuses to release without a verified blood group', async () => {
    const created = await record({ bloodGroupVerified: undefined });

    const res = await request(app)
      .post(`/api/donations/${created.body.id}/release`)
      .set(as(MGM_STAFF))
      .send({});

    // You cannot shelve blood against a group the donor merely claimed.
    // This is the practical reason the two columns are separate.
    expect(res.status).toBe(400);
  });

  it('refuses to release another institution donation', async () => {
    const created = await record();
    const res = await request(app)
      .post(`/api/donations/${created.body.id}/release`)
      .set(as(FORTIS_STAFF))
      .send({ bloodGroupVerified: 'O_POS' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/donations/pending', () => {
  it('lists units awaiting release without exposing donor contact', async () => {
    await record();
    const res = await request(app).get('/api/donations/pending').set(as(MGM_STAFF));

    expect(res.status).toBe(200);
    expect(res.body.pending.length).toBeGreaterThan(0);

    const body = JSON.stringify(res.body);
    // F7: contact details go only to the institution coordinating a
    // request they raised, and a screening queue is not that.
    expect(body).not.toContain('9800000099');
    expect(body).not.toContain('Test Donor');
  });

  it('flags units still missing a verified blood group', async () => {
    await record({ bloodGroupVerified: undefined });
    const res = await request(app).get('/api/donations/pending').set(as(MGM_STAFF));
    const item = res.body.pending.find((p) => p.needsBloodGroup);
    expect(item).toBeDefined();
  });
});
