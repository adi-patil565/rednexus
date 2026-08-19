// Institution application.
import { client } from './client.js';

/**
 * Apply to join the platform. Requires a signed-in Firebase account -
 * the applicant becomes the institution's first staff member.
 */
export const applyAsInstitution = (data) =>
  client.post('/api/institutions/apply', data).then((r) => r.data);
