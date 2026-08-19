// The escalation worker.
//
// Wakes on a timer, asks whether a request still needs more donors, and
// widens the pool by one stage if so. It never creates a request and
// never approves one - it only continues work a human already approved,
// which is why it is allowed to run unattended at all.

import { prisma } from '../config/prisma.js';
import {
  evaluate,
  acceptedUnitsFor,
  waitMinutesFor,
  releaseSurplusDonors,
} from '../services/escalation.service.js';
import { dispatch } from '../services/request.service.js';
import { scheduleEscalationCheck } from './queues.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('escalation-job');

export const runEscalationCheck = async ({ requestId }) => {
  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) return { skipped: 'request gone' };

  const acceptedUnits = await acceptedUnitsFor(prisma, requestId);
  const pendingResponses = await prisma.notificationLog.count({
    where: { requestId, response: 'PENDING' },
  });

  const decision = evaluate({ request, acceptedUnits, pendingResponses });

  if (!decision.escalate) {
    if (decision.reason === 'REQUIREMENT_MET') {
      const released = await releaseSurplusDonors(prisma, requestId);
      log.info({ requestId, ...released }, 'Requirement met');
      return { escalated: false, ...decision, ...released };
    }

    if (decision.reason === 'STILL_WAITING') {
      // Re-arm rather than give up. The timer fired early because the
      // request was re-notified after the job was queued.
      await scheduleEscalationCheck(requestId, decision.minutesRemaining);
    }

    log.info({ requestId, reason: decision.reason }, 'No escalation');
    return { escalated: false, ...decision };
  }

  const result = await dispatch(prisma, requestId);

  log.info(
    { requestId, stage: result.stage, notified: result.notified, reason: decision.reason },
    'Escalated to a wider batch'
  );

  // Chain the next check only if this one actually reached anyone.
  // Re-arming after contacting zero donors would spin a timer that can
  // never change the outcome.
  if (result.notified > 0) {
    await scheduleEscalationCheck(requestId, waitMinutesFor(request));
  }

  return { escalated: true, ...result, reason: decision.reason };
};

export default runEscalationCheck;
