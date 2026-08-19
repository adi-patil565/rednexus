// Recurring transfusion schedules (N1).
import { client } from './client.js';

export const getSchedules = () => client.get('/api/schedules').then((r) => r.data);

export const createSchedule = (data) =>
  client.post('/api/schedules', data).then((r) => r.data);

export const updateSchedule = (id, data) =>
  client.patch(`/api/schedules/${id}`, data).then((r) => r.data);

/** Draft requests for every schedule inside its lead window. Notifies nobody. */
export const arrangeUpcoming = () =>
  client.post('/api/schedules/arrange').then((r) => r.data);

/** Transfusion given; roll the schedule to the next date. */
export const completeTransfusion = (id) =>
  client.post(`/api/schedules/${id}/complete`).then((r) => r.data);
