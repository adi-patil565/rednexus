// Usage reporting API (T1).
import { client } from './client.js';

/** Recent history for the caller's institution, newest first. */
export const getUsageHistory = (days = 7) =>
  client.get('/api/usage', { params: { days } }).then((r) => r.data);

/** Submit one day's report for every blood group in a single request. */
export const submitUsageReport = ({ date, entries }) =>
  client.post('/api/usage', { date, entries }).then((r) => r.data);
