// Institution application tests.

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

const NEW_UID = 'fb-applicant-new';
const DONOR_UID = 'fb-applicant-donor';
const MGM_STAFF = 'seed-staff-mgm_kamothe';
const ADMIN = 'seed-platform-admin';
const as = (uid) => ({ 'x-test-uid': uid });

const APPLICANT_EMAIL = 'newbank@applicant.dummy.in';

const validApplication = (over = {}) => ({
  name: 'Sunrise Blood Centre',
  category: 'EXTERNAL',
  pincode: '400705',
  address: 'Sector 15, Belapur',
  contactName: 'Meera Joshi',
  contactEmail: APPLICANT_EMAIL,
  contactPhone: '9876511111',
  ...over,
});

const cleanup = async () => {
  await prisma.user.deleteMany({
    where: { OR: [{ firebaseUid: NEW_UID }, { email: APPLICANT_EMAIL }] },
  });
  await prisma.institution.deleteMany({ where: { name: { contains: 'Sunrise' } } });
  await prisma.donor.deleteMany({ where: { firebaseUid: DONOR_UID } });
};

beforeAll(async () => {
  if (!(await prisma.user.findUnique({ where: { firebaseUid: ADMIN } }))) {
    throw new Error('Fixtures missing. Run: npm run db:seed');
  }
});

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const apply = (body = {}, uid = NEW_UID) =>
  request(app).post('/api/institutions/apply').set(as(uid)).send(validApplication(body));

describe('applying', () => {
  it('requires a signed-in account', async () => {
    const res = await request(app).post('/api/institutions/apply').send(validApplication());
    expect(res.status).toBe(401);
  });

  it('creates the institution and its first staff account together', async () => {
    const res = await apply();
    expect(res.status).toBe(201);

    const institution = await prisma.institution.findUnique({
      where: { id: res.body.institutionId },
      include: { staff: true },
    });

    // Verification refuses an institution with no staff, so creating
    // both together is what stops an application landing in a state no
    // admin can approve.
    expect(institution.staff).toHaveLength(1);
    expect(institution.staff[0].role).toBe('BLOOD_BANK_STAFF');
  });

  it('★ always lands UNVERIFIED, whatever the applicant sends', async () => {
    const res = await request(app)
      .post('/api/institutions/apply')
      .set(as(NEW_UID))
      .send({ ...validApplication(), verificationStatus: 'VERIFIED' });

    expect(res.status).toBe(201);
    const row = await prisma.institution.findUnique({ where: { id: res.body.institutionId } });
    expect(row.verificationStatus).toBe('UNVERIFIED');
  });

  it('★ ignores any role the applicant tries to claim', async () => {
    // The old Firestore signup let the client pick its own role. Nothing
    // here reads a role from the request body.
    await request(app)
      .post('/api/institutions/apply')
      .set(as(NEW_UID))
      .send({ ...validApplication(), role: 'PLATFORM_ADMIN' });

    const user = await prisma.user.findUnique({ where: { firebaseUid: NEW_UID } });
    expect(user.role).toBe('BLOOD_BANK_STAFF');
  });

  it('requires a hospital name for an in-house blood bank', async () => {
    const res = await apply({ category: 'IN_HOUSE', linkedHospitalName: '' });
    expect(res.status).toBe(400);
  });

  it('accepts an in-house blood bank with its hospital', async () => {
    const res = await apply({ category: 'IN_HOUSE', linkedHospitalName: 'Sunrise Hospital' });
    expect(res.status).toBe(201);
  });

  it('rejects a malformed phone number', async () => {
    const res = await apply({ contactPhone: '12345' });
    expect(res.status).toBe(400);
  });
});

describe('one account, one role', () => {
  it('refuses an account that is already staff somewhere', async () => {
    const res = await apply({}, MGM_STAFF);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_REGISTERED');
  });

  it('★ refuses an account already registered as a donor', async () => {
    await prisma.donor.create({
      data: {
        firebaseUid: DONOR_UID,
        name: 'Existing Donor',
        gender: 'MALE',
        dateOfBirth: new Date('1990-01-01'),
        phone: '9800000123',
        areaPincode: '400705',
        bloodGroupSelfReported: 'O_POS',
        consentAt: new Date(),
        consentPurpose: 'test',
      },
    });

    // The authorization chain resolves exactly one identity per
    // firebaseUid and would otherwise silently pick one.
    const res = await apply({}, DONOR_UID);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_A_DONOR');
  });

  it('refuses an email already on the platform', async () => {
    const res = await apply({ contactEmail: 'anil.sharma@mgmblood.dummy.in' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_TAKEN');
  });

  it('writes nothing when the application is refused', async () => {
    await apply({}, MGM_STAFF);
    const created = await prisma.institution.count({ where: { name: { contains: 'Sunrise' } } });
    expect(created).toBe(0);
  });
});

describe('★ the full join flow', () => {
  it('apply, admin verifies, staff can act', async () => {
    const applied = await apply();
    const institutionId = applied.body.institutionId;

    // Before verification: blocked everywhere.
    const before = await request(app).get('/api/usage').set(as(NEW_UID));
    expect(before.status).toBe(403);

    // The admin sees it waiting.
    const queue = await request(app)
      .get('/api/admin/institutions?status=UNVERIFIED')
      .set(as(ADMIN));
    expect(queue.body.institutions.some((i) => i.id === institutionId)).toBe(true);

    // Verification succeeds because the application brought a staff
    // account with it.
    const decision = await request(app)
      .post(`/api/admin/institutions/${institutionId}/decision`)
      .set(as(ADMIN))
      .send({ decision: 'VERIFIED' });
    expect(decision.status).toBe(200);

    // After: the same staff account can work.
    const after = await request(app).get('/api/usage').set(as(NEW_UID));
    expect(after.status).toBe(200);
  });
});
