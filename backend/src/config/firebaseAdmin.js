// Firebase Admin SDK initialization.
//
// Firebase answers exactly one question: "who is this person?" Role,
// institution, and verification status live in Postgres and are
// enforced by this API. See CLAUDE.md Rules section 1.
//
// Initialization either succeeds or is recorded as unavailable. There
// is no third state where the app pretends to have authenticated
// somebody. The previous implementation fell back to a hardcoded
// `dev-user-id` whenever the SDK was uninitialized, which meant any
// Bearer string authenticated successfully - exactly the bypass
// Rules section 2 forbids shipping.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import admin from 'firebase-admin';
import { env } from './env.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('firebase-admin');

let app = null;
let unavailableReason = null;

/** Load the service account JSON, if the configured path resolves. */
const loadServiceAccount = () => {
  const configured = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!configured) return null;

  const path = resolve(process.cwd(), configured);
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    // Deliberately not logging the file contents - it is a private key.
    throw new Error(
      `Service account file at ${configured} is not valid JSON: ${error.message}`
    );
  }
};

const initialize = () => {
  if (admin.apps.length > 0) {
    app = admin.apps[0];
    return;
  }

  try {
    const serviceAccount = loadServiceAccount();

    if (serviceAccount) {
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      log.info(
        { projectId: serviceAccount.project_id },
        'Firebase Admin initialized from service account file'
      );
      return;
    }

    // Fall back to Application Default Credentials (GOOGLE_APPLICATION_
    // CREDENTIALS pointing elsewhere, gcloud login, or a GCP runtime).
    app = admin.initializeApp({ credential: admin.credential.applicationDefault() });
    log.info('Firebase Admin initialized from application default credentials');
  } catch (error) {
    app = null;
    unavailableReason = error.message;

    log.error(
      { reason: error.message },
      'Firebase Admin could not initialize. Authenticated routes will ' +
        'return 503 until a service account is configured. Download one ' +
        'from Firebase Console > Project Settings > Service Accounts and ' +
        'point GOOGLE_APPLICATION_CREDENTIALS at it.'
    );
  }
};

initialize();

/** True when tokens can actually be verified. */
export const isAuthAvailable = () => app !== null;

/** Why auth is unavailable, for operator-facing diagnostics only. */
export const getUnavailableReason = () => unavailableReason;

/**
 * Verify a Firebase ID token.
 * @param {string} idToken
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 * @throws if auth is unavailable or the token is invalid
 */
export const verifyIdToken = async (idToken) => {
  if (!app) {
    throw new Error('Firebase Admin is not initialized');
  }
  return admin.auth(app).verifyIdToken(idToken);
};

export default { isAuthAvailable, getUnavailableReason, verifyIdToken };
