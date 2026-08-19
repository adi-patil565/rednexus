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

// --- Staff-facing donor management -------------------------------
// Contact details ARE returned by these. F7 restricts donor contact to
// verified institutions; staff reviewing their own donor pool are
// exactly who that exception is for.

/** Donors held after answering yes to "advised not to donate?". */
export const getReviewQueue = () =>
  client.get('/api/donors/review-queue').then((r) => r.data);

/** A staff member has spoken to the donor and cleared them. */
export const clearDonorReview = (id) =>
  client.post(`/api/donors/${id}/clear-review`).then((r) => r.data);

/** Set the verified blood group, or record a deferral. No reason field. */
export const updateDonorAsStaff = (id, data) =>
  client.patch(`/api/donors/${id}/staff`, data).then((r) => r.data);

/** Requires a phone or pincode - there is no "list everyone" call. */
export const searchDonors = ({ phone, pincode }) =>
  client.get('/api/donors/search', { params: { phone, pincode } }).then((r) => r.data);
