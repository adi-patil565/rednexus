// Worker entry point.
//
//   npm run worker        (from backend/)
//
// Runs separately from the API so a slow escalation batch cannot block
// a staff member approving an alert. If this process is not running,
// nothing breaks - escalation simply waits for a human to press
// "contact more donors", which is the workflow blood banks already have.

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { ESCALATION_QUEUE } from './queues.js';
import { runEscalationCheck } from './escalation.job.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('worker');

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(ESCALATION_QUEUE, async (job) => runEscalationCheck(job.data), {
  connection,
  // One at a time. Escalation widens a donor pool; running several in
  // parallel for the same institution could contact the same person for
  // two requests within seconds, which is precisely the fatigue the
  // budget check exists to prevent.
  concurrency: 1,
});

worker.on('completed', (job, result) => {
  log.info({ jobId: job.id, ...result }, 'Escalation check done');
});

worker.on('failed', (job, error) => {
  log.error({ jobId: job?.id, reason: error.message }, 'Escalation check failed');
});

log.info({ queue: ESCALATION_QUEUE }, 'Worker listening');

const shutdown = async () => {
  log.info('Shutting down worker');
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
