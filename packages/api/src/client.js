// HTTP client for the Express API.
//
// Attaches the caller's Firebase ID token to every request. The token
// establishes WHO is calling; the API resolves what they may do from
// Postgres. Nothing here decides permissions - a client that could
// would be a client that could lie.

import axios from 'axios';
import { auth } from './firebase.js';

export const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

client.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    // getIdToken refreshes automatically when the token is near expiry.
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Normalise API errors into something a form can render.
 *
 * The API returns { error, message, fields? }. Field-level messages are
 * written for the person filling the form, so they are surfaced as-is
 * rather than replaced with a generic failure.
 */
export const toFormError = (error) => {
  const data = error?.response?.data;
  if (!data) {
    return { message: 'Could not reach the server. Check your connection.', fields: {} };
  }
  return {
    code: data.error ?? 'UNKNOWN',
    message: data.message ?? 'Something went wrong.',
    fields: data.fields ?? {},
  };
};

export default client;
