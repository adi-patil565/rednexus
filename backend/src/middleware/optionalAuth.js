// Optional authentication.
//
// For routes that are public but behave better when they know who is
// calling. Donor registration is the case: someone scanning a QR at a
// camp has no account, and requiring one before they can register would
// put a wall across the recruiting funnel. But if they DID just create
// an account, the record should be linked to it so they can sign in
// afterwards and actually see their alerts.
//
// A bad token is treated as no token rather than as an error. The
// caller is not claiming privileges - there are none to claim here.

import { isAuthAvailable, verifyIdToken } from '../config/firebaseAdmin.js';

export const optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ') || !isAuthAvailable()) {
    return next();
  }

  try {
    const decoded = await verifyIdToken(header.slice('Bearer '.length).trim());
    req.firebaseUid = decoded.uid;
  } catch {
    // Deliberately silent. This route works fine without identity.
  }

  return next();
};

export default optionalAuth;
