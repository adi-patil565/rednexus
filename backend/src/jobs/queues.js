// BullMQ queues.
//
// Redis is treated as OPTIONAL infrastructure on purpose. If it is
// down, escalation stops happening automatically - and nothing else
// breaks. Staff can still approve alerts and press "contact more
// donors" by hand, which is the pre-platform workflow and a perfectly
// good floor to fall back to.
//
// The alternative, where a Redis outage takes down blood requests, is
// unacceptable for what this system is for.

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('queues');

export const ESCALATION_QUEUE = 'escalation';

let connection = null;
let escalationQueue = null;
let unavailableReason = null;

const buildConnection = () => {
  const client = new IORedis(env.REDIS_URL, {
    // BullMQ requires this. Without it a blocking command retries
    // forever and the process never exits.
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 500, 3000)),
    lazyConnect: true,
  });

  client.on('error', (error) => {
    if (unavailableReason !== error.message) {
      unavailableReason = error.message;
      log.warn({ reason: error.message }, 'Redis unavailable; escalation will not run automatically');
    }
  });

  return client;
};

export const getEscalationQueue = () => {
  if (escalationQueue) return escalationQueue;
  try {
    connection = connection ?? buildConnection();
    escalationQueue = new Queue(ESCALATION_QUEUE, { connection });
    return escalationQueue;
  } catch (error) {
    log.warn({ reason: error.message }, 'Could not create escalation queue');
    return null;
  }
};

/**
 * Schedule an escalation check for a request.
 *
 * Never throws. A request that cannot schedule its own follow-up is
 * still a valid request - it simply waits for a human instead.
 */
export const scheduleEscalationCheck = async (requestId, delayMinutes) => {
  const queue = getEscalationQueue();
  if (!queue) return { scheduled: false, reason: 'queue unavailable' };

  try {
    await queue.add(
      'check',
      { requestId },
      {
        delay: delayMinutes * 60_000,
        // One pending check per request. Re-notifying replaces the old
        // timer rather than stacking a second one that would widen the
        // pool twice for the same silence.
        jobId: `escalate:${requestId}`,
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      }
    );
    return { scheduled: true, delayMinutes };
  } catch (error) {
    log.warn({ requestId, reason: error.message }, 'Could not schedule escalation check');
    return { scheduled: false, reason: error.message };
  }
};

export const closeQueues = async () => {
  if (escalationQueue) await escalationQueue.close().catch(() => {});
  if (connection) await connection.quit().catch(() => {});
  escalationQueue = null;
  connection = null;
};

export default { getEscalationQueue, scheduleEscalationCheck, closeQueues, ESCALATION_QUEUE };
