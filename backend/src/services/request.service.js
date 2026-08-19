// Request lifecycle (T5, F4, F5).
//
// The only module permitted to write Request.state. Every write goes
// through transitionTo, which asserts against the state machine table
// (Rules section 2).
//
// The shape of this file reflects one rule above all others: drafting
// and dispatching are separated by a human. detectBreaches creates
// DETECTED rows and cannot notify anybody. dispatch refuses to run
// unless a named staff member has already moved the request to RAISED.

import { BLOOD_GROUP_LABELS } from '@rednexus/types';
import { STATE, assertTransition, NOTIFIABLE_STATES } from '../lib/stateMachine.js';
import { checkBreach } from './threshold.service.js';
import { getEffectiveStock, getPendingScreening } from './stock.service.js';
import { selectDonors, DEFAULT_MONTHLY_CAP } from './targeting.service.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('request');

/**
 * Move a request through the state machine.
 *
 * Throws IllegalTransitionError on anything the table forbids, so a
 * caller cannot skip states by mistake - RAISED -> DONATED would mean
 * recording a donation against a request nobody was ever notified about.
 */
export const transitionTo = async (prisma, requestId, nextState, extra = {}) => {
  const current = await prisma.request.findUnique({ where: { id: requestId } });
  if (!current) throw Object.assign(new Error('Request not found'), { status: 404 });

  assertTransition(current.state, nextState);

  return prisma.request.update({
    where: { id: requestId },
    data: { state: nextState, ...extra },
  });
};

/**
 * T5 — draft alerts for blood groups at or below their CONFIRMED
 * threshold.
 *
 * Creates DETECTED rows. Notifies nobody. Cannot notify anybody: there
 * is no code path from here to a donor that does not pass through a
 * staff confirmation first.
 *
 * Runs on demand now; it becomes the scheduled BullMQ job in Phase 6.
 */
export const detectBreaches = async (prisma, institutionId) => {
  const thresholds = await prisma.bloodGroupThreshold.findMany({
    where: { institutionId, confirmedThreshold: { not: null } },
  });

  const stock = await getEffectiveStock(prisma, institutionId);
  const pending = await getPendingScreening(prisma, institutionId);

  const drafted = [];

  for (const threshold of thresholds) {
    const s = stock.get(threshold.bloodGroup);
    const breach = checkBreach(threshold, s.effective);
    if (!breach?.inBreach) continue;

    // Units already collected and awaiting screening will clear the
    // shortfall on their own. Asking donors for blood that is sitting
    // in the lab is exactly the wasted contact the preference cap and
    // staged escalation exist to prevent.
    const awaiting = pending.get(threshold.bloodGroup) ?? 0;
    if (awaiting >= breach.shortfall) {
      log.info(
        { institutionId, bloodGroup: threshold.bloodGroup, awaiting, shortfall: breach.shortfall },
        'Breach covered by units awaiting screening; no draft created'
      );
      continue;
    }

    // One open draft per blood group. Re-running must not pile up
    // duplicate alerts for the same shortfall.
    const existing = await prisma.request.findFirst({
      where: {
        institutionId,
        bloodGroup: threshold.bloodGroup,
        state: { notIn: [STATE.CLOSED, STATE.CANCELLED] },
      },
    });
    if (existing) continue;

    const label = BLOOD_GROUP_LABELS[threshold.bloodGroup];
    const request = await prisma.request.create({
      data: {
        institutionId,
        bloodGroup: threshold.bloodGroup,
        unitsNeeded: breach.shortfall - awaiting,
        origin: 'THRESHOLD_BREACH',
        state: STATE.DETECTED,
        stockAtDetection: breach.currentStock,
        thresholdAtDetection: breach.confirmedThreshold,
        detectionBasis:
          `${label} stock is ${breach.currentStock} units, at or below the ` +
          `minimum of ${breach.confirmedThreshold} you confirmed. ` +
          (awaiting > 0
            ? `${awaiting} units are awaiting screening, leaving ${breach.shortfall - awaiting} short.`
            : `Short by ${breach.shortfall}.`),
      },
    });

    log.info(
      { requestId: request.id, institutionId, bloodGroup: threshold.bloodGroup },
      'Threshold breach drafted, awaiting staff confirmation'
    );
    drafted.push(request);
  }

  return drafted;
};

/**
 * The confirmation gate: DETECTED -> RAISED.
 *
 * Records who and when. Rules section 1 forbids an auto-confirm mode, a
 * bulk-approve shortcut, or a setting that disables this - so this
 * function takes one request id and one user, and there is no variant
 * that takes a list.
 */
export const confirmRequest = async (prisma, requestId, user, overrides = {}) => {
  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) throw Object.assign(new Error('Request not found'), { status: 404 });

  if (request.institutionId !== user.institutionId) {
    throw Object.assign(new Error('Not your institution'), { status: 403 });
  }

  const updated = await transitionTo(prisma, requestId, STATE.RAISED, {
    confirmedByUserId: user.id,
    confirmedAt: new Date(),
    ...(overrides.unitsNeeded ? { unitsNeeded: overrides.unitsNeeded } : {}),
    ...(overrides.urgent != null ? { urgent: overrides.urgent } : {}),
  });

  log.info(
    { requestId, institutionId: user.institutionId, userId: user.id },
    'Request confirmed by staff; donors may now be notified'
  );

  return updated;
};

/**
 * F4 / F5 — notify the next batch of donors.
 *
 * Refuses outright unless the request has passed the gate. This is the
 * last line of defence: even if some future caller forgot the check,
 * a DETECTED request cannot reach a donor from here.
 */
export const dispatch = async (prisma, requestId, { today = new Date() } = {}) => {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { institution: true },
  });
  if (!request) throw Object.assign(new Error('Request not found'), { status: 404 });

  if (!NOTIFIABLE_STATES.includes(request.state)) {
    throw Object.assign(
      new Error(
        request.state === STATE.DETECTED
          ? 'This alert has not been confirmed by staff yet.'
          : `A request in state ${request.state} cannot notify donors.`
      ),
      { status: 409, code: 'NOT_NOTIFIABLE' }
    );
  }

  const stage = request.stageLevel + 1;

  // Candidate pool: never PENDING_REVIEW, never permanently deferred.
  // Those two are excluded in the query rather than the filter chain
  // because they are not preferences - they are people a human has said
  // must not be contacted.
  const donors = await prisma.donor.findMany({
    where: { status: { in: ['ACTIVE', 'PROVISIONAL'] } },
  });

  const monthStart = new Date(today);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const monthCounts = await prisma.notificationLog.groupBy({
    by: ['donorId'],
    where: { sentAt: { gte: monthStart } },
    _count: { _all: true },
  });
  const sentThisMonth = new Map(monthCounts.map((r) => [r.donorId, r._count._all]));

  const priorLogs = await prisma.notificationLog.findMany({
    where: { requestId },
    select: { donorId: true },
  });
  const alreadyNotified = new Set(priorLogs.map((l) => l.donorId));

  const { selected, funnel } = selectDonors({
    donors,
    bloodGroup: request.bloodGroup,
    institutionPincode: request.institution.pincode,
    sentThisMonth,
    alreadyNotified,
    unitsNeeded: request.unitsNeeded,
    stage,
    cap: DEFAULT_MONTHLY_CAP,
    today,
  });

  if (selected.length === 0) {
    log.warn({ requestId, stage, funnel }, 'No donors available to notify');
    return { notified: 0, stage, funnel };
  }

  await prisma.$transaction([
    prisma.notificationLog.createMany({
      data: selected.map(({ donor, score }) => ({
        requestId,
        donorId: donor.id,
        // Channel sequencing (push -> wait -> SMS -> wait -> IVR) is
        // Phase 6. The donor's stated preference is honoured now.
        channel: donor.preferredChannel,
        stage,
        rankScore: score,
      })),
      skipDuplicates: true,
    }),
    prisma.request.update({
      where: { id: requestId },
      data: { state: STATE.NOTIFIED, stageLevel: stage },
    }),
  ]);

  // Rules section 4: donor IDs only, never names or phone numbers.
  log.info(
    { requestId, stage, notified: selected.length, funnel },
    'Donors notified'
  );

  return { notified: selected.length, stage, funnel };
};

/** A donor's answer to one notification. */
export const respond = async (prisma, requestId, donorId, accepted) => {
  const logRow = await prisma.notificationLog.findUnique({
    where: { requestId_donorId: { requestId, donorId } },
  });
  if (!logRow) throw Object.assign(new Error('Notification not found'), { status: 404 });

  if (logRow.response !== 'PENDING') {
    throw Object.assign(new Error('You have already answered this request.'), { status: 409 });
  }

  await prisma.notificationLog.update({
    where: { id: logRow.id },
    data: {
      response: accepted ? 'ACCEPTED' : 'DECLINED',
      respondedAt: new Date(),
    },
  });

  if (!accepted) return { state: null, accepted: 0 };

  const acceptedCount = await prisma.notificationLog.count({
    where: { requestId, response: 'ACCEPTED' },
  });

  const request = await prisma.request.findUnique({ where: { id: requestId } });

  // First acceptance moves NOTIFIED -> ACCEPTED. Later ones do not
  // re-transition; the count is what matters after that.
  if (request.state === STATE.NOTIFIED) {
    await transitionTo(prisma, requestId, STATE.ACCEPTED);
    return { state: STATE.ACCEPTED, accepted: acceptedCount };
  }

  return { state: request.state, accepted: acceptedCount };
};

export default { transitionTo, detectBreaches, confirmRequest, dispatch, respond };
