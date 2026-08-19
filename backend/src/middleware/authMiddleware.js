import admin from 'firebase-admin';

// Initialize firebase-admin if credentials or app exists
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.warn('[Backend Auth] Firebase Admin SDK running in offline/uninitialized fallback mode.');
  }
}

/**
 * Express Middleware to verify Bearer Firebase ID token
 */
export const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Bearer token missing.' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    if (admin.apps.length) {
      const decodedToken = await admin.auth().verifyIdToken(token);
      req.user = decodedToken;
      return next();
    } else {
      // Fallback decode for development if admin app is uninitialized
      req.user = { uid: 'dev-user-id', email: 'dev@raktasetu.org', role: 'DONOR' };
      return next();
    }
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
};
