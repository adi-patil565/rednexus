// Camp API (F10).
import { client } from './client.js';

/** Upcoming camps. Public - a donor browses before signing in. */
export const getUpcomingCamps = ({ pincode, days } = {}) =>
  client.get('/api/camps', { params: { pincode, days } }).then((r) => r.data);

/** Camps this institution has posted, including past ones. */
export const getMyCamps = () => client.get('/api/camps/mine').then((r) => r.data);

export const createCamp = (data) => client.post('/api/camps', data).then((r) => r.data);

export const cancelCamp = (id) => client.post(`/api/camps/${id}/cancel`).then((r) => r.data);

/** Donor taps "I'll try to come". Tapping again withdraws it. */
export const toggleCampAttendance = (id) =>
  client.post(`/api/camps/${id}/attend`).then((r) => r.data);
