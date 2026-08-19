// Staged escalation and notification budget (F3, F5).
//
// Phase 6's done-when: "a simulated under-response triggers escalation
// correctly, and a donor with a monthly cap isn't double-notified
// within the same month."
//
// Both halves matter for the same reason. Escalation exists so a
// request that nobody answered can widen; the cap exists so widening
// never means asking the same person again. Without the cap, escalation
// is just a slower blast.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../middleware/authMiddleware.js', () => ({
  verifyFirebaseToken: (req, res, next) => {
    const uid = req.headers['x-test-uid'];
    if (!uid) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    req.firebaseUid = uid;
    return next();
  },
}));

// Redis is not available in every environment this runs in, and the
// queue is designed to degrade rather than fail. Stubbed so these tests
// assert escalation LOGIC, not BullMQ.
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
  evaluate,
  waitMinutesFor,
  releaseSurplusDonors,
  expireStaleNotifications,
  MAX_AUTO_STAGE,
} = await import('../services/escalation.service.js');
const { nextChannel, startingChannel, CHANNEL_CHAIN } = await import(
  '../services/notification.service.js'
);
const { DEFAULT_MONTHLY_CAP } = await import('../services/targeting.service.js');

const MGM_STAFF = 'seed-staff-mgm_kamothe';
const INST = 'mgm_kamothe';
const as = (uid) => ({ 'x-test-uid': uid });

const DONOR_IDS = Array.from({ length: 6 }, (_, i) => `esc-donor-${i}`);

const minutesAgo = (n) => new Date(Date.now() - n * 60_000);

const cleanup = async () => {
  await prisma.notificationLog.deleteMany({ where: { donorId: { in: DONOR_IDS } } });
  await prisma.request.deleteMany({ where: { institutionId: INST } });
  await prisma.donor.deleteMany({ where: { id: { in: DONOR_IDS } } });
};

beforeAll(async () => {
  if (!(await prisma.user.findUnique({ where: { firebaseUid: MGM_STAFF } }))) {
    throw new Error('Fixtures missing. Run: npm run db:seed');
  }
});

beforeEach(async () => {
  await cleanup();
  await prisma.donor.createMany({
    data: DONOR_IDS.map((id, i) => ({
      id,
      firebaseUid: `fb-${id}`,
      name: `Escalation Donor ${i}`,
      gender: 'MALE',
      dateOfBirth: new Date('1990-01-01'),
      phone: `98111000${String(i).padStart(2, '0')}`,
      areaPincode: '410209',
      bloodGroupSelfReported: 'O_POS',
      bloodGroupVerified: 'O_POS',
      status: 'ACTIVE',
      lastDonationDate: new Date('2025-01-01'),
      consentAt: new Date(),
      consentPurpose: 'test',
    })),
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const makeRequest = async (over = {}) =>
  prisma.request.create({
    data: {
      institutionId: INST,
      bloodGroup: 'O_POS',
      unitsNeeded: 2,
      origin: 'MANUAL',
      state: 'RAISED',
      confirmedAt: new Date(),
      ...over,
    },
  });

describe('the escalation decision', () => {
  it('waits before widening — silence is not refusal', async () => {
    const req = await makeRequest();
    const decision = evaluate({ request: req, acceptedUnits: 0, pendingResponses: 3 });

    // A donor who has not replied in two minutes is at work.
    expect(decision.escalate).toBe(false);
    expect(decision.reason).toBe('STILL_WAITING');
  });

  it('★ widens once the wait has elapsed and nobody answered', async () => {
    const req = await makeRequest();
    req.updatedAt = minutesAgo(200);

    const decision = evaluate({ request: req, acceptedUnits: 0, pendingResponses: 3 });
    expect(decision.escalate).toBe(true);
    expect(decision.reason).toBe('NO_RESPONSE');
    expect(decision.nextStage).toBe(1);
  });

  it('distinguishes nobody answering from some answering', async () => {
    const req = await makeRequest();
    req.updatedAt = minutesAgo(200);

    expect(evaluate({ request: req, acceptedUnits: 0, pendingResponses: 0 }).reason).toBe(
      'NO_RESPONSE'
    );
    expect(evaluate({ request: req, acceptedUnits: 1, pendingResponses: 2 }).reason).toBe(
      'PARTIAL_RESPONSE'
    );
  });

  it('★ stops when the requirement is met', async () => {
    const req = await makeRequest({ unitsNeeded: 2 });
    req.updatedAt = minutesAgo(500);

    const decision = evaluate({ request: req, acceptedUnits: 2, pendingResponses: 5 });
    expect(decision.escalate).toBe(false);
    expect(decision.reason).toBe('REQUIREMENT_MET');
  });

  it('★ hands over to a human rather than widening forever', async () => {
    const req = await makeRequest({ stageLevel: MAX_AUTO_STAGE });
    req.updatedAt = minutesAgo(500);

    const decision = evaluate({ request: req, acceptedUnits: 0, pendingResponses: 0 });
    expect(decision.escalate).toBe(false);
    expect(decision.reason).toBe('MAX_STAGE_REACHED');
    // Three widenings without enough donors is a situation a person
    // should look at, not a loop that keeps messaging more people.
    expect(decision.needsHuman).toBe(true);
  });

  it('never escalates a closed or cancelled request', async () => {
    for (const state of ['CLOSED', 'CANCELLED']) {
      const req = await makeRequest({ state });
      req.updatedAt = minutesAgo(500);
      expect(evaluate({ request: req, acceptedUnits: 0, pendingResponses: 0 }).escalate).toBe(
        false
      );
      await prisma.request.delete({ where: { id: req.id } });
    }
  });

  it('moves faster on an urgent request, but not instantly', async () => {
    const urgent = await makeRequest({ urgent: true });
    const normal = await makeRequest();

    expect(waitMinutesFor(urgent)).toBeLessThan(waitMinutesFor(normal));
    // Still long enough that a donor at work is not chased in minutes.
    expect(waitMinutesFor(urgent)).toBeGreaterThanOrEqual(30);
  });
});

describe('★ notification budget', () => {
  it('does not contact the same donor twice in a month across requests', async () => {
    // Phase 6's done-when, exactly. Fill every donor to the cap.
    //
    // Across SEPARATE requests, deliberately. NotificationLog is unique
    // on (requestId, donorId) - one donor cannot be logged twice for
    // the same request - so stacking rows on one request silently
    // collapses to a single row and leaves everyone under the cap. That
    // is also the truer scenario: the monthly cap exists to stop a
    // donor being asked about several DIFFERENT requests in one month.
    for (let i = 0; i < DEFAULT_MONTHLY_CAP; i += 1) {
      const priorRequest = await makeRequest();
      await prisma.notificationLog.createMany({
        data: DONOR_IDS.map((donorId) => ({
          requestId: priorRequest.id,
          donorId,
          channel: 'SMS',
          stage: 1,
          sentAt: new Date(),
        })),
        skipDuplicates: true,
      });
    }

    const fresh = await makeRequest();
    const res = await request(app).post(`/api/requests/${fresh.id}/notify`).set(as(MGM_STAFF));

    expect(res.status).toBe(200);

    // The seed carries its own eligible O+ donors, so "nobody was
    // contacted" was never the right assertion. What the cap promises
    // is narrower and more important: a donor already at their limit
    // is not contacted again.
    const contacted = await prisma.notificationLog.findMany({
      where: { requestId: fresh.id },
      select: { donorId: true },
    });
    const contactedIds = new Set(contacted.map((c) => c.donorId));

    for (const cappedDonor of DONOR_IDS) {
      expect(contactedIds.has(cappedDonor)).toBe(false);
    }
  });

  it('contacts donors who are under the cap', async () => {
    const req = await makeRequest();
    const res = await request(app).post(`/api/requests/${req.id}/notify`).set(as(MGM_STAFF));
    expect(res.body.notified).toBeGreaterThan(0);
  });

  it('★ widening never re-contacts someone already asked', async () => {
    const req = await makeRequest({ unitsNeeded: 1 });

    await request(app).post(`/api/requests/${req.id}/notify`).set(as(MGM_STAFF));
    await request(app).post(`/api/requests/${req.id}/notify`).set(as(MGM_STAFF));

    const logs = await prisma.notificationLog.findMany({ where: { requestId: req.id } });
    const unique = new Set(logs.map((l) => l.donorId));
    expect(unique.size).toBe(logs.length);
  });
});

describe('channel chain', () => {
  it('★ is sequential, never parallel', () => {
    // Rules section 2. Three messages at once about one request reads
    // as spam from an organisation the donor is doing a favour for.
    expect(CHANNEL_CHAIN).toEqual(['PUSH', 'SMS', 'IVR']);
    expect(nextChannel('PUSH')).toBe('SMS');
    expect(nextChannel('SMS')).toBe('IVR');
  });

  it('ends rather than looping', () => {
    expect(nextChannel('IVR')).toBeNull();
  });

  it("★ starts on the donor's stated preference", () => {
    // Honouring a preference by trying something else first is not
    // honouring it.
    expect(startingChannel('SMS')).toBe('SMS');
    expect(startingChannel('IVR')).toBe('IVR');
  });

  it('falls back to SMS for an unrecognised preference', () => {
    // PRD N5: alerts must work on feature phones.
    expect(startingChannel('CARRIER_PIGEON')).toBe('SMS');
  });
});

describe('★ requirement met', () => {
  it('stands down donors beyond what was needed', async () => {
    const req = await makeRequest({ unitsNeeded: 2 });

    // Four accept for two units.
    for (let i = 0; i < 4; i += 1) {
      await prisma.notificationLog.create({
        data: {
          requestId: req.id,
          donorId: DONOR_IDS[i],
          channel: 'SMS',
          stage: 1,
          response: 'ACCEPTED',
          respondedAt: new Date(Date.now() + i * 1000),
        },
      });
    }

    const result = await releaseSurplusDonors(prisma, req.id);

    expect(result.kept).toBe(2);
    expect(result.released).toBe(2);
    // A donor who takes time off, arrives, and finds they were not
    // needed does not answer the next request.
    expect(result.message).toMatch(/thank you/i);
    expect(result.message).not.toMatch(/sorry|unfortunately|rejected/i);
  });

  it('keeps whoever accepted first', async () => {
    const req = await makeRequest({ unitsNeeded: 1 });

    await prisma.notificationLog.create({
      data: {
        requestId: req.id,
        donorId: DONOR_IDS[0],
        channel: 'SMS',
        stage: 1,
        response: 'ACCEPTED',
        respondedAt: minutesAgo(30),
      },
    });
    await prisma.notificationLog.create({
      data: {
        requestId: req.id,
        donorId: DONOR_IDS[1],
        channel: 'SMS',
        stage: 1,
        response: 'ACCEPTED',
        respondedAt: minutesAgo(5),
      },
    });

    const result = await releaseSurplusDonors(prisma, req.id);
    // First come is the only fair rule once people have answered in
    // good faith.
    expect(result.releasedDonorIds).toEqual([DONOR_IDS[1]]);
  });

  it('releases nobody when the requirement is exactly met', async () => {
    const req = await makeRequest({ unitsNeeded: 2 });
    for (let i = 0; i < 2; i += 1) {
      await prisma.notificationLog.create({
        data: {
          requestId: req.id,
          donorId: DONOR_IDS[i],
          channel: 'SMS',
          stage: 1,
          response: 'ACCEPTED',
          respondedAt: new Date(),
        },
      });
    }
    expect((await releaseSurplusDonors(prisma, req.id)).released).toBe(0);
  });
});

describe('stale notifications', () => {
  it('★ expires unanswered ones so silence stays distinguishable', async () => {
    const req = await makeRequest();
    await prisma.notificationLog.create({
      data: {
        requestId: req.id,
        donorId: DONOR_IDS[0],
        channel: 'SMS',
        stage: 1,
        sentAt: minutesAgo(600),
      },
    });

    const expired = await expireStaleNotifications(prisma, req.id, 300);
    expect(expired).toBe(1);

    // "Did not answer" and "has not answered yet" must not collapse
    // into one value - the Phase 9 response model needs the difference.
    const row = await prisma.notificationLog.findFirst({ where: { requestId: req.id } });
    expect(row.response).toBe('EXPIRED');
  });

  it('leaves recent ones pending', async () => {
    const req = await makeRequest();
    await prisma.notificationLog.create({
      data: {
        requestId: req.id,
        donorId: DONOR_IDS[0],
        channel: 'SMS',
        stage: 1,
        sentAt: minutesAgo(10),
      },
    });

    expect(await expireStaleNotifications(prisma, req.id, 300)).toBe(0);
  });
});
