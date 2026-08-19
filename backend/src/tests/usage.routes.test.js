// Integration tests for T1 usage reporting.
//
// Only the Firebase layer is mocked - a test cannot mint a real ID
// token. Everything downstream is the real thing: loadUser, requireRole
// and requireVerifiedInstitution run against the seeded Postgres
// fixtures, and the route writes real rows.
//
// That matters because the assertion worth having here is that an
// UNVERIFIED institution is refused. Rules section 2 says verification
// cannot be bypassed "including in development", so the check has to be
// exercised against real data rather than a stub that returns true.
//
// Requires: docker compose up + npm run db:seed.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Stand in for Firebase token verification: the test supplies a uid
// directly via a header. Everything after this point is production code.
vi.mock('../middleware/authMiddleware.js', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) {
      return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing Bearer token.' });
    }
    req.firebaseUid = uid;
    return next();
  },
}));

const request = (await import('supertest')).default;
const app = (await import('../app.js')).default;
const { prisma } = await import('../config/prisma.js');

// Seeded fixtures (see prisma/seed.js)
const MGM_STAFF = 'seed-staff-mgm_kamothe';      // VERIFIED institution
const FORTIS_STAFF = 'seed-staff-fortis_vashi';  // UNVERIFIED institution
const ADMIN = 'seed-platform-admin';             // wrong role for this route

const as = (uid) => (uid ? { 'x-test-uid': uid } : {});

// Use a date far from today so these tests never collide with the
// history assertions or with manual testing.
const TEST_DATE = '2026-01-15';

beforeAll(async () => {
  const seeded = await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } });
  if (!seeded) {
    throw new Error('Fixtures missing. Run: npm run db:seed');
  }
  await prisma.usageRecord.deleteMany({ where: { date: new Date(TEST_DATE) } });
});

afterAll(async () => {
  await prisma.usageRecord.deleteMany({ where: { date: new Date(TEST_DATE) } });
  await prisma.$disconnect();
});

describe('POST /api/usage — authorization', () => {
  const body = { date: TEST_DATE, entries: [{ bloodGroup: 'O_POS', unitsIssued: 5, stockOnHand: 20 }] };

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/usage').send(body);
    expect(res.status).toBe(401);
  });

  it('rejects a Firebase user with no platform account', async () => {
    // Anyone can sign up with Firebase. That must not grant staff access.
    const res = await request(app).post('/api/usage').set(as('some-random-signup-uid')).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_PROVISIONED');
  });

  it('★ rejects staff at an UNVERIFIED institution', async () => {
    const res = await request(app).post('/api/usage').set(as(FORTIS_STAFF)).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INSTITUTION_NOT_VERIFIED');
  });

  it('rejects a PLATFORM_ADMIN — wrong role for reporting usage', async () => {
    const res = await request(app).post('/api/usage').set(as(ADMIN)).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('writes nothing when authorization fails', async () => {
    const count = await prisma.usageRecord.count({ where: { date: new Date(TEST_DATE) } });
    expect(count).toBe(0);
  });

  it('accepts staff at a VERIFIED institution', async () => {
    const res = await request(app).post('/api/usage').set(as(MGM_STAFF)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.recorded).toBe(1);
  });
});

describe('POST /api/usage — validation', () => {
  const post = (payload) => request(app).post('/api/usage').set(as(MGM_STAFF)).send(payload);

  it('rejects a duplicate blood group in one report', async () => {
    const res = await post({
      date: TEST_DATE,
      entries: [
        { bloodGroup: 'B_POS', unitsIssued: 1, stockOnHand: 1 },
        { bloodGroup: 'B_POS', unitsIssued: 2, stockOnHand: 2 },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('rejects negative units', async () => {
    const res = await post({ date: TEST_DATE, entries: [{ bloodGroup: 'B_POS', unitsIssued: -5, stockOnHand: 10 }] });
    expect(res.status).toBe(400);
  });

  it('rejects a future date', async () => {
    const res = await post({ date: '2030-01-01', entries: [{ bloodGroup: 'B_POS', unitsIssued: 1, stockOnHand: 1 }] });
    expect(res.status).toBe(400);
  });

  it('rejects an empty report', async () => {
    const res = await post({ date: TEST_DATE, entries: [] });
    expect(res.status).toBe(400);
  });

  it('accepts all eight blood groups in one submission', async () => {
    const groups = ['A_POS','A_NEG','B_POS','B_NEG','O_POS','O_NEG','AB_POS','AB_NEG'];
    const res = await post({
      date: TEST_DATE,
      entries: groups.map((g, i) => ({ bloodGroup: g, unitsIssued: i, stockOnHand: i * 2 })),
    });
    expect(res.status).toBe(201);
    expect(res.body.recorded).toBe(8);
  });
});

describe('POST /api/usage — corrections', () => {
  it('★ re-reporting a day corrects it rather than duplicating', async () => {
    const post = (units) =>
      request(app).post('/api/usage').set(as(MGM_STAFF))
        .send({ date: TEST_DATE, entries: [{ bloodGroup: 'O_POS', unitsIssued: units, stockOnHand: 30 }] });

    await post(12);
    await post(14); // the typo fix

    const rows = await prisma.usageRecord.findMany({
      where: { date: new Date(TEST_DATE), bloodGroup: 'O_POS' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].unitsIssued).toBe(14);
  });

  it('records who reported, for the audit trail', async () => {
    const row = await prisma.usageRecord.findFirst({
      where: { date: new Date(TEST_DATE), bloodGroup: 'O_POS' },
      include: { reportedBy: true },
    });
    expect(row.reportedBy).not.toBeNull();
    expect(row.reportedBy.role).toBe('BLOOD_BANK_STAFF');
  });
});

describe('GET /api/usage', () => {
  it('is scoped to the caller institution and reports gaps', async () => {
    const res = await request(app).get('/api/usage?days=7').set(as(MGM_STAFF));
    expect(res.status).toBe(200);
    expect(res.body.bloodGroups).toHaveLength(8);
    // PRD section 10: never block on missing data - surface it instead.
    expect(Array.isArray(res.body.missingDates)).toBe(true);
  });

  it('rejects an unverified institution', async () => {
    const res = await request(app).get('/api/usage').set(as(FORTIS_STAFF));
    expect(res.status).toBe(403);
  });
});
