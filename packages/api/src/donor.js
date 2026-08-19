// Donor API (F1 registration, F3 preferences, F8 history).
import { client } from './client.js';

/** QR camp registration. Public - no account exists yet. */
export const registerDonor = (data) =>
  client.post('/api/donors', data).then((r) => r.data);

/** Eligibility summary for any donor. Carries no contact details (F7). */
export const getDonorSummary = (id) =>
  client.get(`/api/donors/${id}`).then((r) => r.data);

/** Requests this donor has been asked about. */
export const getMyAlerts = () =>
  client.get('/api/donors/me/alerts').then((r) => r.data);

/** The donor's own donation history and Hb trend. */
export const getMyDonations = () =>
  client.get('/api/donors/me/donations').then((r) => r.data);

/** Pause mode and preferred channel. */
export const updateMyPreferences = (prefs) =>
  client.patch('/api/donors/me/preferences', prefs).then((r) => r.data);
