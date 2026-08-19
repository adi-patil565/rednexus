// Authentication middleware — fails closed, always.
//
// This file previously contained a development fallback: if the Firebase
// Admin SDK was uninitialized, it set req.user to a hardcoded
// `dev-user-id` and called next(). Because the SDK is uninitialized
// whenever no service account is present, that meant ANY Bearer string
// authenticated successfully, in any environment, including production.
//
// Rules section 2: "Institution verification cannot be bypassed,
// including in development. Do not add a debug flag that skips
// verification in any environment that could ship."
//
// The replacement distinguishes two failures that must never be
// conflated:
//   503 - this server cannot verify tokens (an operator problem)
//   401 - this caller did not present a valid one (a caller problem)
// Neither one lets the request through.

import { isAuthAvailable, getUnavailableReason, verifyIdToken } from '../config/firebaseAdmin.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('auth');

/**
 * Verifies the Bearer token and attaches `req.firebaseUid`.
 *
 * Deliberately does NOT attach a role. Identity comes from Firebase;
 * authority comes from the Postgres users table via loadUser, so that a
 * forged or stale token claim can never grant privileges.
 */
export const verifyFirebaseToken = async (req, res, next) => {
  if (!isAuthAvailable()) {
    log.error(
      { path: req.path, reason: getUnavailableReason() },
      'Rejecting authenticated request: token verification unavailable'
    );
    return res.status(503).json({
      error: 'AUTH_UNAVAILABLE',
      message:
        'This server cannot verify authentication tokens. A Firebase ' +
        'service account is not configured.',
    });
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Missing Bearer token.',
    });
  }

  const idToken = header.slice('Bearer '.length).trim();
  if (!idToken) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Missing Bearer token.',
    });
  }

  try {
    const decoded = await verifyIdToken(idToken);
    req.firebaseUid = decoded.uid;
    req.firebaseToken = decoded;
    return next();
  } catch (error) {
    // Log the failure reason but never the token itself.
    log.warn({ path: req.path, reason: error.code || error.message }, 'Token verification failed');
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Invalid or expired authentication token.',
    });
  }
};

export default verifyFirebaseToken;
