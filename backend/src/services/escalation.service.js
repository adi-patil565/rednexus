// Staged escalation (F5) and the requirement-met close.
//
// PRD F5: "Notify a small ranked batch first; widen only if unmet after
// a wait window."
//
// The restraint is the feature. Contacting fifty people for two units
// gets the units and costs the goodwill of forty-eight, and PRD section
// 8 measures exactly that ratio - notifications sent per successful
// donation. Every stage here asks the smallest group that could
// plausibly answer.

import { STATE } from '../lib/stateMachine.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('escalation');

/**
 * How long to wait before widening the pool.
 *
 * Urgent requests move faster, but never instantly: a donor who has not
 * replied in ninety seconds is at work, not refusing. Escalating that
 * fast would contact the next batch for no reason and then the batch
 * after that.
 */
export const WAIT_MINUTES = { NORMAL: 120, URGENT: 45 };

/** Stage 3 is the last automatic widening. Beyond that a human decides. */
export const MAX_AUTO_STAGE = 3;

export const waitMinutesFor = (request) =>
  request.urgent ? WAIT_MINUTES.URGENT : WAIT_MINUTES.NORMAL;

/**
 * Should this request widen to another batch?
 *
 * Returns a decision object rather than a boolean so the caller - and
 * the log - can say WHY, which matters when someone asks why a donor
 * was or was not contacted.
 */
export const evaluate = ({ request, acceptedUnits, pendingResponses, now = new Date() }) => {
  if (request.state === STATE.CLOSED || request.state === STATE.CANCELLED) {
    return { escalate: false, reason: 'REQUEST_FINISHED' };
  }

  if (acceptedUnits >= request.unitsNeeded) {
    return { escalate: false, reason: 'REQUIREMENT_MET' };
  }

  if (request.stageLevel >= MAX_AUTO_STAGE) {
    // Not a failure - a handover. Three widenings without enough
    // donors is a situation a person should look at, not a loop that
    // keeps messaging more people.
    return { escalate: false, reason: 'MAX_STAGE_REACHED', needsHuman: true };
  }

  const waited = (now - new Date(request.updatedAt)) / 60000;
  const required = waitMinutesFor(request);
  if (waited < required) {
    return {
      escalate: false,
      reason: 'STILL_WAITING',
      minutesRemaining: Math.ceil(required - waited),
    };
  }

  // Both widen, but they mean different things to whoever reads the
  // log later: PARTIAL means donors accepted and it was not enough,
  // NO_RESPONSE means nobody accepted at all. Outstanding-but-unanswered
  // notifications are NOT a partial response - silence is silence.
  return {
    escalate: true,
    reason: acceptedUnits > 0 ? 'PARTIAL_RESPONSE' : 'NO_RESPONSE',
    nextStage: request.stageLevel + 1,
    acceptedSoFar: acceptedUnits,
    stillAwaitingReply: pendingResponses,
  };
};

/**
 * Units already secured for a request.
 *
 * Counts ACCEPTED notifications. One donor, one unit - donations are
 * whole-blood, and a donor who accepts is offering one bag.
 */
export const acceptedUnitsFor = async (prisma, requestId) =>
  prisma.notificationLog.count({ where: { requestId, response: 'ACCEPTED' } });

/**
 * Close a request whose requirement is met, and tell the donors who are
 * no longer needed.
 *
 * PRD Pipeline 3: "auto 'thank you, requirement met' message to donors
 * who accepted beyond what was needed."
 *
 * Worth doing properly. A donor who took time off to come in, arrived,
 * and found they were not needed does not answer the next request - and
 * this is the cheapest possible way to avoid that.
 */
export const releaseSurplusDonors = async (prisma, requestId) => {
  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) return { released: 0 };

  const accepted = await prisma.notificationLog.findMany({
    where: { requestId, response: 'ACCEPTED' },
    orderBy: { respondedAt: 'asc' },
  });

  // First to accept are the ones asked to come. Anyone beyond the
  // requirement is thanked and stood down - ordering by response time
  // rather than by rank, because they answered in good faith and first
  // come is the only fair rule once they have.
  const surplus = accepted.slice(request.unitsNeeded);

  if (surplus.length === 0) return { released: 0, kept: accepted.length };

  log.info(
    { requestId, kept: request.unitsNeeded, released: surplus.length },
    'Requirement met; standing down surplus donors'
  );

  return {
    released: surplus.length,
    kept: Math.min(accepted.length, request.unitsNeeded),
    releasedDonorIds: surplus.map((s) => s.donorId),
    // Plain language, and it does not imply they did anything wrong.
    message:
      'Thank you for offering. Enough donors have come forward for this ' +
      'request, so you do not need to come in. We will let you know when ' +
      'blood of your group is needed again.',
  };
};

/**
 * Pending (unanswered) notifications that have gone stale.
 *
 * Marked EXPIRED rather than left PENDING forever, so "did not answer"
 * and "has not answered yet" stay distinguishable - the response-scoring
 * model in Phase 9 needs that difference to mean something.
 */
export const expireStaleNotifications = async (prisma, requestId, olderThanMinutes) => {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60000);
  const result = await prisma.notificationLog.updateMany({
    where: { requestId, response: 'PENDING', sentAt: { lt: cutoff } },
    data: { response: 'EXPIRED' },
  });
  return result.count;
};

export default {
  evaluate,
  waitMinutesFor,
  acceptedUnitsFor,
  releaseSurplusDonors,
  expireStaleNotifications,
  WAIT_MINUTES,
  MAX_AUTO_STAGE,
};
