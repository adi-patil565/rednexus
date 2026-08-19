// Threshold API (T2 / T3 / T4).
import { client } from './client.js';

/** Proposals plus whatever is currently confirmed. */
export const getThresholds = (windowDays = 28) =>
  client.get('/api/thresholds', { params: { windowDays } }).then((r) => r.data);

/**
 * Confirm ONE blood group. There is deliberately no confirmAll here:
 * the API has no such endpoint, and adding a client-side loop that
 * called this eight times would recreate the bulk-approve shortcut
 * Rules section 1 forbids.
 */
export const confirmThreshold = (bloodGroup, { confirmedThreshold, confirmedCollectionTarget }) =>
  client
    .post(`/api/thresholds/${bloodGroup}/confirm`, {
      confirmedThreshold,
      confirmedCollectionTarget,
    })
    .then((r) => r.data);

/** Confirmed thresholds vs current stock. Reports only; drafts nothing. */
export const getBreaches = () =>
  client.get('/api/thresholds/breaches').then((r) => r.data);
