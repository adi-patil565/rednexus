// Authenticated identity.
//
// The client asks "who am I and what may I do?" and the answer comes
// from Postgres, not from the Firebase token. The token proves
// identity; role, institution and verification status are read fresh
// from the database on every call.

import { Router } from 'express';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { prisma } from '../config/prisma.js';

const router = Router();

// GET /api/auth/me
//
// Deliberately NOT behind loadUser: a Firebase user with no platform
// account is a legitimate state (a donor, or someone who just signed
// up), and the client needs a 200 telling it so rather than a 403.
router.get('/me', verifyFirebaseToken, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUid },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            category: true,
            linkedHospitalName: true,
            verificationStatus: true,
          },
        },
      },
    });

    if (!user) {
      return res.json({
        provisioned: false,
        role: null,
        institution: null,
        message: 'This account is not registered as staff on the platform.',
      });
    }

    return res.json({
      provisioned: true,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      institution: user.institution,
      // Surfaced so the dashboard can explain why actions are blocked
      // rather than letting the user discover it as a failed request.
      canAct:
        user.role === 'PLATFORM_ADMIN' ||
        user.institution?.verificationStatus === 'VERIFIED',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
