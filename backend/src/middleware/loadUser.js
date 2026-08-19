// Authorization chain: identity -> authority.
//
// verifyFirebaseToken establishes WHO the caller is (req.firebaseUid).
// These middlewares establish WHAT THEY MAY DO, and they resolve it
// from Postgres on every request - never from a token claim.
//
// That distinction is the structural fix for four separate findings in
// the Firestore implementation, where the browser supplied its own
// role at signup, chose its own role on Google sign-in, could write its
// own institution verificationStatus, and could have a DONOR profile
// fabricated for it on a missing document. None of those are reachable
// once role and verification live in a table the client cannot write.
//
// Resolving from the database each time also means revoking staff
// access is a single UPDATE, with no stale token to wait out.

import { prisma } from '../config/prisma.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('authz');

/**
 * Resolve req.firebaseUid to the Postgres user record.
 * Must run after verifyFirebaseToken.
 */
export const loadUser = async (req, res, next) => {
  if (!req.firebaseUid) {
    // A programming error, not a caller error: the route was wired
    // without verifyFirebaseToken in front of this.
    log.error({ path: req.path }, 'loadUser reached without an authenticated uid');
    return res.status(500).json({
      error: 'MISCONFIGURED_ROUTE',
      message: 'Authorization could not be evaluated.',
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUid },
      include: { institution: true },
    });

    if (!user) {
      // Authenticated with Firebase but not provisioned here. Staff and
      // admin accounts are created deliberately, never self-registered,
      // so this is the expected outcome for anyone who signs up and
      // then calls a staff endpoint.
      return res.status(403).json({
        error: 'NOT_PROVISIONED',
        message: 'This account is not registered as staff on the platform.',
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Restrict a route to specific roles.
 * @param {...('BLOOD_BANK_STAFF'|'PLATFORM_ADMIN')} allowed
 */
export const requireRole =
  (...allowed) =>
  (req, res, next) => {
    if (!req.user) {
      log.error({ path: req.path }, 'requireRole reached without a loaded user');
      return res.status(500).json({
        error: 'MISCONFIGURED_ROUTE',
        message: 'Authorization could not be evaluated.',
      });
    }

    if (!allowed.includes(req.user.role)) {
      log.warn(
        { userId: req.user.id, role: req.user.role, path: req.path },
        'Role check failed'
      );
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Your account does not have permission for this action.',
      });
    }

    return next();
  };

/**
 * Require that the caller's institution has been verified by a platform
 * admin.
 *
 * Rules section 2: "Institution verification cannot be bypassed,
 * including in development." There is no environment flag here and no
 * override - an unverified blood bank cannot report usage, confirm a
 * threshold, or raise a request.
 */
export const requireVerifiedInstitution = (req, res, next) => {
  if (!req.user) {
    log.error({ path: req.path }, 'requireVerifiedInstitution reached without a loaded user');
    return res.status(500).json({
      error: 'MISCONFIGURED_ROUTE',
      message: 'Authorization could not be evaluated.',
    });
  }

  if (!req.user.institution) {
    return res.status(403).json({
      error: 'NO_INSTITUTION',
      message: 'This account is not linked to a blood bank.',
    });
  }

  if (req.user.institution.verificationStatus !== 'VERIFIED') {
    log.warn(
      {
        userId: req.user.id,
        institutionId: req.user.institution.id,
        status: req.user.institution.verificationStatus,
      },
      'Blocked action from an unverified institution'
    );
    return res.status(403).json({
      error: 'INSTITUTION_NOT_VERIFIED',
      message:
        'Your blood bank is awaiting verification by a platform administrator.',
    });
  }

  return next();
};

/** Convenience chain for verified blood bank staff actions. */
export const verifiedStaff = [loadUser, requireRole('BLOOD_BANK_STAFF'), requireVerifiedInstitution];

export default { loadUser, requireRole, requireVerifiedInstitution, verifiedStaff };
