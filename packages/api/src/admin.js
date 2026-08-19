// Platform admin API.
//
// Narrow on purpose: an admin decides WHICH blood banks exist on the
// platform. Confirming a threshold or approving an alert belongs to the
// institution's own staff, and there is no client function here for
// either, because there is no endpoint.
import { client } from './client.js';

export const getInstitutions = (status) =>
  client.get('/api/admin/institutions', { params: status ? { status } : {} }).then((r) => r.data);

export const getInstitution = (id) =>
  client.get(`/api/admin/institutions/${id}`).then((r) => r.data);

/** decision: 'VERIFIED' | 'REJECTED' */
export const decideInstitution = (id, decision) =>
  client.post(`/api/admin/institutions/${id}/decision`, { decision }).then((r) => r.data);

export const getPlatformStats = () => client.get('/api/admin/stats').then((r) => r.data);
