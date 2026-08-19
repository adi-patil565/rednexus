// Camp tests (F10).

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
const DONOR_UID = 'fb-camp-test-donor';
const DONOR_ID = 'camp-test-donor';
const as = (uid) => ({ 'x-test-uid': uid });

const soon = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const validCamp = (over = {}) => ({
  title: 'MGM Campus Drive',
  date: soon(14),
  timeNote: '9 AM to 4 PM',
  location: 'MGM Campus, Kamothe',
  pincode: '410209',
  ...over,
});

const cleanup = async () => {
  await prisma.campAttendance.deleteMany({ where: { donorId: DONOR_ID } });
  await prisma.camp.deleteMany({ where: { institutionId: INST } });
  await prisma.donor.deleteMany({ where: { id: DONOR_ID } });
};

beforeAll(async () => {
  if (!(await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } }))) {
    throw new Error('Fixtures missing. Run: npm run db:seed');
  }
});

beforeEach(async () => {
  await cleanup();
  await prisma.donor.create({
    data: {
      id: DONOR_ID,
      firebaseUid: DONOR_UID,
      name: 'Camp Test Donor',
      gender: 'FEMALE',
      dateOfBirth: new Date('1998-03-03'),
      phone: '9812300099',
      areaPincode: '410209',
      bloodGroupSelfReported: 'O_POS',
      status: 'ACTIVE',
      consentAt: new Date(),
      consentPurpose: 'test',
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const post = (body, uid = MGM_STAFF) =>
  request(app).post('/api/camps').set(as(uid)).send(body);

describe('posting a camp', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/camps').send(validCamp());
    expect(res.status).toBe(401);
  });

  it('★ refuses an unverified institution', async () => {
    const res = await post(validCamp(), FORTIS_STAFF);
    expect(res.status).toBe(403);
  });

  it('creates a camp for verified staff', async () => {
    const res = await post(validCamp());
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('MGM Campus Drive');
  });

  it('★ returns the QR registration path', async () => {
    // The link printed on the banner. Donors who scan it arrive with
    // registeredAtCampId set, which is what makes "did this camp
    // recruit anyone" answerable later.
    const res = await post(validCamp());
    expect(res.body.registrationPath).toBe(`/register?camp=${res.body.id}`);
  });

  it('rejects a date in the past', async () => {
    const res = await post(validCamp({ date: soon(-1) }));
    expect(res.status).toBe(400);
  });

  it('accepts a camp posted for today', async () => {
    // Camps do get posted the morning of.
    const res = await post(validCamp({ date: soon(0) }));
    expect(res.status).toBe(201);
  });

  it('rejects a malformed pincode', async () => {
    const res = await post(validCamp({ pincode: '41020' }));
    expect(res.status).toBe(400);
  });

  it('accepts free-text timing rather than forcing a picker', async () => {
    const res = await post(validCamp({ timeNote: 'after morning rounds' }));
    expect(res.status).toBe(201);
    expect(res.body.timeNote).toBe('after morning rounds');
  });
});

describe('public listing', () => {
  it('★ needs no account — a donor browses before signing up', async () => {
    await post(validCamp());
    const res = await request(app).get('/api/camps');
    expect(res.status).toBe(200);
    expect(res.body.camps.length).toBeGreaterThan(0);
  });

  it('filters by pincode', async () => {
    await post(validCamp({ pincode: '410209' }));
    await post(validCamp({ title: 'Vashi Drive', pincode: '400703' }));

    const res = await request(app).get('/api/camps?pincode=400703');
    expect(res.body.camps).toHaveLength(1);
    expect(res.body.camps[0].title).toBe('Vashi Drive');
  });

  it('excludes camps beyond the requested window', async () => {
    await post(validCamp({ date: soon(120) }));
    const res = await request(app).get('/api/camps?days=30');
    expect(res.body.camps).toHaveLength(0);
  });

  it('★ shows an interest COUNT, never who is coming', async () => {
    const created = await post(validCamp());
    await request(app).post(`/api/camps/${created.body.id}/attend`).set(as(DONOR_UID));

    const res = await request(app).get('/api/camps');
    const camp = res.body.camps.find((c) => c.id === created.body.id);

    expect(camp.interestedCount).toBe(1);
    // Who is attending a camp is nobody else's business (F7).
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('Camp Test Donor');
    expect(body).not.toContain('9812300099');
  });
});

describe('attendance', () => {
  it('requires a donor account', async () => {
    const created = await post(validCamp());
    const res = await request(app)
      .post(`/api/camps/${created.body.id}/attend`)
      .set(as(MGM_STAFF));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_A_DONOR');
  });

  it('★ toggles rather than stacking duplicates', async () => {
    const created = await post(validCamp());
    const id = created.body.id;

    const first = await request(app).post(`/api/camps/${id}/attend`).set(as(DONOR_UID));
    expect(first.body.attending).toBe(true);

    const second = await request(app).post(`/api/camps/${id}/attend`).set(as(DONOR_UID));
    expect(second.body.attending).toBe(false);

    const rows = await prisma.campAttendance.findMany({ where: { campId: id } });
    expect(rows).toHaveLength(0);
  });

  it('★ never phrases attendance as a commitment', async () => {
    const created = await post(validCamp());
    const res = await request(app)
      .post(`/api/camps/${created.body.id}/attend`)
      .set(as(DONOR_UID));

    // A tap that reads as a promise is a tap people avoid making.
    expect(res.body.message).toMatch(/hope/i);
    expect(res.body.message).not.toMatch(/commit|promise|confirmed|must/i);
  });

  it('lists the camps a donor said yes to', async () => {
    const created = await post(validCamp());
    await request(app).post(`/api/camps/${created.body.id}/attend`).set(as(DONOR_UID));

    const res = await request(app).get('/api/camps/mine-attending').set(as(DONOR_UID));
    expect(res.body.campIds).toContain(created.body.id);
  });
});

describe('cancellation', () => {
  it('★ cancels rather than deletes, so interested donors can be told', async () => {
    const created = await post(validCamp());
    await request(app).post(`/api/camps/${created.body.id}/attend`).set(as(DONOR_UID));

    const res = await request(app)
      .post(`/api/camps/${created.body.id}/cancel`)
      .set(as(MGM_STAFF));
    expect(res.status).toBe(200);

    // The row survives - a deleted camp cannot tell anyone it is off.
    const row = await prisma.camp.findUnique({ where: { id: created.body.id } });
    expect(row).not.toBeNull();
    expect(row.cancelledAt).toBeInstanceOf(Date);

    // And the attendance survives with it.
    const attendance = await prisma.campAttendance.findMany({
      where: { campId: created.body.id },
    });
    expect(attendance).toHaveLength(1);
  });

  it('drops a cancelled camp from the public listing', async () => {
    const created = await post(validCamp());
    await request(app).post(`/api/camps/${created.body.id}/cancel`).set(as(MGM_STAFF));

    const res = await request(app).get('/api/camps');
    expect(res.body.camps.find((c) => c.id === created.body.id)).toBeUndefined();
  });

  it('cannot cancel twice', async () => {
    const created = await post(validCamp());
    await request(app).post(`/api/camps/${created.body.id}/cancel`).set(as(MGM_STAFF));
    const second = await request(app)
      .post(`/api/camps/${created.body.id}/cancel`)
      .set(as(MGM_STAFF));
    expect(second.status).toBe(409);
  });

  it('cannot cancel another institution camp', async () => {
    const created = await post(validCamp());
    const res = await request(app)
      .post(`/api/camps/${created.body.id}/cancel`)
      .set(as(FORTIS_STAFF));
    expect(res.status).toBe(403);
  });
});

describe('staff listing', () => {
  it('shows past camps too, marked as past', async () => {
    await post(validCamp({ date: soon(5) }));
    const res = await request(app).get('/api/camps/mine').set(as(MGM_STAFF));

    expect(res.status).toBe(200);
    expect(res.body.camps.length).toBeGreaterThan(0);
    expect(res.body.camps[0]).toHaveProperty('past');
    expect(res.body.camps[0]).toHaveProperty('registrationPath');
  });

  it('is scoped to the caller institution', async () => {
    await post(validCamp());
    const res = await request(app).get('/api/camps/mine').set(as(MGM_STAFF));
    expect(res.body.camps.every((c) => c.bloodBank === 'MGM Hospital Blood Bank')).toBe(true);
  });
});
