// Recurring transfusion schedules (N1).
//
// Phase 8's done-when: "a simulated recurring schedule produces a
// correctly timed buddy-pool arrangement."
//
// Timing is the whole feature. Arranging too early gets agreement from
// donors who then forget; too late leaves no room to escalate. The
// tests below pin both edges of that window.

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
const {
  isDueForArrangement,
  advanceDueDate,
  daysUntilDue,
  FREQUENCY_DAYS,
} = await import('../services/recurring.service.js');

const MGM_STAFF = 'seed-staff-mgm_kamothe';
const FORTIS_STAFF = 'seed-staff-fortis_vashi';
const INST = 'mgm_kamothe';
const as = (uid) => ({ 'x-test-uid': uid });

const inDays = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const isoIn = (n) => inDays(n).toISOString().slice(0, 10);

const cleanup = async () => {
  await prisma.request.deleteMany({ where: { institutionId: INST } });
  await prisma.recurringSchedule.deleteMany({ where: { institutionId: INST } });
};

beforeAll(async () => {
  if (!(await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } }))) {
    throw new Error('Fixtures missing. Run: npm run db:seed');
  }
});

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const validSchedule = (over = {}) => ({
  patientRef: 'MGM/THAL/2024/118',
  bloodGroup: 'B_POS',
  unitsPerVisit: 2,
  frequency: 'FORTNIGHTLY',
  nextDueDate: isoIn(20),
  leadDays: 7,
  ...over,
});

const create = (body = {}, uid = MGM_STAFF) =>
  request(app).post('/api/schedules').set(as(uid)).send(validSchedule(body));

describe('★ privacy', () => {
  it('stores an opaque reference, never a patient identity', async () => {
    const res = await create();
    expect(res.status).toBe(201);

    const row = await prisma.recurringSchedule.findUnique({ where: { id: res.body.id } });

    // Architecture.md section 6: "patient_ref (anonymised)". A donor
    // must never be able to reach a patient, and the cleanest guarantee
    // is that the platform does not know who the patient is.
    expect(row.patientRef).toBe('MGM/THAL/2024/118');
    expect(row).not.toHaveProperty('patientName');
    expect(row).not.toHaveProperty('diagnosis');
    expect(row).not.toHaveProperty('dateOfBirth');
  });

  it('★ never names a patient in the donor-visible request text', async () => {
    await create({ nextDueDate: isoIn(3) });
    await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));

    const req = await prisma.request.findFirst({ where: { institutionId: INST } });
    // Staff recognise their own file numbers. The basis reaches the
    // approval screen, so it carries the reference and nothing more.
    expect(req.detectionBasis).toContain('MGM/THAL/2024/118');
    expect(req.detectionBasis).not.toMatch(/thalassemia|diagnosis|patient name/i);
  });
});

describe('timing of arrangement', () => {
  const schedule = (over = {}) => ({
    active: true,
    leadDays: 7,
    nextDueDate: inDays(20),
    frequency: 'FORTNIGHTLY',
    ...over,
  });

  it('★ does not arrange before the lead window opens', () => {
    // Donors who agree three weeks out forget and are unreachable on
    // the day, which is worse than not having asked.
    expect(isDueForArrangement(schedule({ nextDueDate: inDays(20) }))).toBe(false);
  });

  it('★ arranges exactly when the window opens', () => {
    expect(isDueForArrangement(schedule({ nextDueDate: inDays(7) }))).toBe(true);
  });

  it('arranges inside the window', () => {
    expect(isDueForArrangement(schedule({ nextDueDate: inDays(3) }))).toBe(true);
  });

  it('still arranges for a date already passed — better late than never', () => {
    expect(isDueForArrangement(schedule({ nextDueDate: inDays(-1) }))).toBe(true);
  });

  it('never arranges for an inactive schedule', () => {
    expect(isDueForArrangement(schedule({ nextDueDate: inDays(1), active: false }))).toBe(false);
  });
});

describe('the cycle', () => {
  it('advances by the frequency interval', () => {
    for (const [frequency, days] of Object.entries(FREQUENCY_DAYS)) {
      const next = advanceDueDate({ nextDueDate: inDays(0), frequency });
      expect(daysUntilDue({ nextDueDate: next })).toBe(days);
    }
  });

  it('★ advances from the DUE date, not from today', async () => {
    // A transfusion given two days late must not shift the patient's
    // rhythm permanently - the cycle is clinical, not administrative.
    //
    // Created with a future date and then moved back, because creation
    // rejects past dates on purpose. This is the real sequence anyway:
    // the date passes while the schedule exists, and the transfusion
    // happens late.
    const res = await create({ nextDueDate: isoIn(5), frequency: 'FORTNIGHTLY' });
    await prisma.recurringSchedule.update({
      where: { id: res.body.id },
      data: { nextDueDate: inDays(-2) },
    });

    const done = await request(app)
      .post(`/api/schedules/${res.body.id}/complete`)
      .set(as(MGM_STAFF));

    expect(done.status).toBe(200);
    // 2 days ago + 14 = 12 days from now, not 14.
    const row = await prisma.recurringSchedule.findUnique({ where: { id: res.body.id } });
    expect(daysUntilDue(row)).toBe(12);
  });
});

describe('★ drafting goes through the same gate', () => {
  it('creates a DETECTED request, notifying nobody', async () => {
    await create({ nextDueDate: isoIn(5) });

    const res = await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));
    expect(res.body.drafted).toBe(1);

    const req = await prisma.request.findFirst({ where: { institutionId: INST } });
    expect(req.state).toBe('DETECTED');
    expect(req.origin).toBe('SCHEDULED');

    // A predictable need is still a need a human approves.
    const notifications = await prisma.notificationLog.count({ where: { requestId: req.id } });
    expect(notifications).toBe(0);
  });

  it('says the alert has not been sent', async () => {
    await create({ nextDueDate: isoIn(5) });
    const res = await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));
    expect(res.body.message).toMatch(/needs your approval/i);
  });

  it('drafts nothing outside the lead window', async () => {
    await create({ nextDueDate: isoIn(30) });
    const res = await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));
    expect(res.body.drafted).toBe(0);
  });

  it('★ does not stack a second request for the same transfusion', async () => {
    await create({ nextDueDate: isoIn(5) });
    await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));
    const second = await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));
    expect(second.body.drafted).toBe(0);
  });

  it('carries the units the patient actually needs', async () => {
    await create({ nextDueDate: isoIn(5), unitsPerVisit: 3 });
    await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));
    const req = await prisma.request.findFirst({ where: { institutionId: INST } });
    expect(req.unitsNeeded).toBe(3);
  });
});

describe('coverage', () => {
  it('reports days remaining so shortfall can be judged', async () => {
    await create({ nextDueDate: isoIn(5) });
    await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));

    const res = await request(app).get('/api/schedules').set(as(MGM_STAFF));
    const s = res.body.schedules[0];

    // "Two short" means something different at six days out than at one.
    expect(s.coverage.arranged).toBe(true);
    expect(s.coverage.needed).toBe(2);
    expect(s.coverage.daysRemaining).toBe(5);
  });

  it('★ flags a shortfall as at risk only when time is short', async () => {
    await create({ nextDueDate: isoIn(1) });
    await request(app).post('/api/schedules/arrange').set(as(MGM_STAFF));

    const res = await request(app).get('/api/schedules').set(as(MGM_STAFF));
    // Running out of days with an incomplete pool is exactly what this
    // feature exists to catch early.
    expect(res.body.schedules[0].coverage.atRisk).toBe(true);
  });

  it('shows nothing arranged before the window opens', async () => {
    await create({ nextDueDate: isoIn(30) });
    const res = await request(app).get('/api/schedules').set(as(MGM_STAFF));
    expect(res.body.schedules[0].coverage.arranged).toBe(false);
  });
});

describe('access', () => {
  it('refuses an unverified institution', async () => {
    const res = await create({}, FORTIS_STAFF);
    expect(res.status).toBe(403);
  });

  it('rejects a past due date on creation', async () => {
    const res = await create({ nextDueDate: isoIn(-5) });
    expect(res.status).toBe(400);
  });

  it('requires a patient reference', async () => {
    const res = await request(app)
      .post('/api/schedules')
      .set(as(MGM_STAFF))
      .send({ ...validSchedule(), patientRef: '' });
    expect(res.status).toBe(400);
  });

  it('★ ending a schedule records when, rather than deleting it', async () => {
    const res = await create();
    await request(app)
      .patch(`/api/schedules/${res.body.id}`)
      .set(as(MGM_STAFF))
      .send({ active: false });

    const row = await prisma.recurringSchedule.findUnique({ where: { id: res.body.id } });
    // A patient's course ending is something a blood bank may need to
    // look back at.
    expect(row).not.toBeNull();
    expect(row.active).toBe(false);
    expect(row.endedAt).toBeInstanceOf(Date);
  });
});
