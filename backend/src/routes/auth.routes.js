// Authenticated identity.
//
// The client asks "who am I and what may I do?" and the answer comes
// from Postgres, not from the Firebase token. The token proves
// identity; role, institution and verification status are read fresh
// from the database on every call.
//
// Two separate populations share Firebase Auth but not a table:
//
//   User  - blood bank staff and platform admins. Provisioned
//           deliberately; nobody self-registers into one.
//   Donor - members of the public. Self-register via the camp QR flow.
//
// A person is one or the other. Checking both here is what lets a
// single sign-in screen serve both surfaces.

import { Router } from 'express';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { prisma } from '../config/prisma.js';
import { computeEligibility, eligibilityMessage } from '../services/eligibility.service.js';
import { BLOOD_GROUP_LABELS } from '@rednexus/types';

const router = Router();

// GET /api/auth/me
//
// Deliberately NOT behind loadUser: someone authenticated with Firebase
// but present in neither table is a legitimate state - they just signed
// up - and the client needs a 200 describing that rather than a 403.
router.get('/me', verifyFirebaseToken, async (req, res, next) => {
  try {
    const staff = await prisma.user.findUnique({
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

    if (staff) {
      return res.json({
        kind: staff.role === 'PLATFORM_ADMIN' ? 'ADMIN' : 'STAFF',
        provisioned: true,
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        institution: staff.institution,
        // Surfaced so the dashboard can explain why actions are blocked
        // rather than letting the user discover it as a failed request.
        canAct:
          staff.role === 'PLATFORM_ADMIN' ||
          staff.institution?.verificationStatus === 'VERIFIED',
      });
    }

    const donor = await prisma.donor.findUnique({
      where: { firebaseUid: req.firebaseUid },
    });

    if (donor) {
      const eligibility = computeEligibility(donor);
      return res.json({
        kind: 'DONOR',
        provisioned: true,
        id: donor.id,
        name: donor.name,
        // A donor reading their own record. F7 governs exposing donor
        // details to OTHER parties; it does not hide someone from
        // themselves.
        bloodGroup: BLOOD_GROUP_LABELS[donor.bloodGroupSelfReported],
        bloodGroupVerified: donor.bloodGroupVerified
          ? BLOOD_GROUP_LABELS[donor.bloodGroupVerified]
          : null,
        areaPincode: donor.areaPincode,
        status: donor.status,
        eligible: eligibility.eligible,
        eligibleFrom: eligibility.eligibleFrom,
        eligibilityMessage: eligibilityMessage(eligibility),
        notificationsPaused: donor.notificationsPaused,
        preferredChannel: donor.preferredChannel,
        priorDonationCount: donor.priorDonationCount ?? 0,
      });
    }

    return res.json({
      kind: null,
      provisioned: false,
      role: null,
      institution: null,
      message: 'This account is not registered on the platform yet.',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
