// Request API (T5 / F4 / F5).
import { client } from './client.js';

export const getRequests = (state) =>
  client.get('/api/requests', { params: state ? { state } : {} }).then((r) => r.data);

export const getRequest = (id) => client.get(`/api/requests/${id}`).then((r) => r.data);

/** Run T5 breach detection now. Creates drafts; notifies nobody. */
export const detectBreaches = () =>
  client.post('/api/requests/detect').then((r) => r.data);

/**
 * The gate. One request at a time.
 *
 * There is deliberately no confirmAll here. The API has no such
 * endpoint, and a client-side loop calling this in sequence would
 * recreate the bulk-approve shortcut Rules section 1 forbids.
 */
export const confirmRequest = (id, { unitsNeeded, urgent } = {}) =>
  client.post(`/api/requests/${id}/confirm`, { unitsNeeded, urgent }).then((r) => r.data);

export const notifyDonors = (id) =>
  client.post(`/api/requests/${id}/notify`).then((r) => r.data);

export const transitionRequest = (id, to) =>
  client.post(`/api/requests/${id}/transition`, { to }).then((r) => r.data);

export const raiseManualRequest = ({ bloodGroup, unitsNeeded, urgent, reason }) =>
  client.post('/api/requests', { bloodGroup, unitsNeeded, urgent, reason }).then((r) => r.data);

/** Donor-facing: answer an alert. */
export const respondToRequest = (id, accept) =>
  client.post(`/api/requests/${id}/respond`, { accept }).then((r) => r.data);
