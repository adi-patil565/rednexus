// Institution application — how a blood bank joins the platform.
//
// Until now institutions existed only in the seed, which made the
// admin verification flow real but gave a genuine blood bank no way to
// arrive. This closes that: apply, wait for a platform admin, then act.
//
// The applicant must already be signed in with Firebase. That is what
// ties the application to a person, and it is what lets the same
// request create both the institution and its first staff account.
//
// Creating both together is deliberate. Verification refuses an
// institution with no BLOOD_BANK_STAFF user (Phase 3's done-when), so
// separating the two would let an application land in a state no admin
// could approve, with nothing on screen explaining why.

import { Router } from 'express';
import { institutionApplySchema } from '@rednexus/validators';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { applicationLimiter } from '../middleware/rateLimits.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('institution');
const router = Router();

// POST /api/institutions/apply
router.post('/apply', applicationLimiter, verifyFirebaseToken, async (req, res, next) => {
  const parsed = institutionApplySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      fields: parsed.error.errors.reduce((acc, e) => {
        acc[e.path.join('.')] = e.message;
        return acc;
      }, {}),
    });
  }

  const input = parsed.data;

  try {
    // One account, one role. A person cannot be staff at two
    // institutions, and cannot be both a donor and staff - the
    // authorization chain resolves exactly one identity per firebaseUid
    // and would silently pick one otherwise.
    const existingStaff = await prisma.user.findUnique({
      where: { firebaseUid: req.firebaseUid },
      include: { institution: { select: { name: true, verificationStatus: true } } },
    });

    if (existingStaff) {
      return res.status(409).json({
        error: 'ALREADY_REGISTERED',
        message: existingStaff.institution
          ? `This account is already staff at ${existingStaff.institution.name}.`
          : 'This account is already registered on the platform.',
      });
    }

    const existingDonor = await prisma.donor.findUnique({
      where: { firebaseUid: req.firebaseUid },
    });
    if (existingDonor) {
      return res.status(409).json({
        error: 'ALREADY_A_DONOR',
        message:
          'This account is registered as a donor. Use a different email to ' +
          'register a blood bank.',
      });
    }

    // Email is unique across users, so a second application from a
    // different Firebase account but the same work address is caught
    // here rather than by a database error.
    const emailTaken = await prisma.user.findUnique({
      where: { email: input.contactEmail },
    });
    if (emailTaken) {
      return res.status(409).json({
        error: 'EMAIL_TAKEN',
        message: 'That email address is already registered on the platform.',
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const institution = await tx.institution.create({
        data: {
          name: input.name,
          category: input.category,
          linkedHospitalName:
            input.category === 'IN_HOUSE' ? input.linkedHospitalName || null : null,
          pincode: input.pincode,
          address: input.address || null,
          // Server-controlled, always. An applicant cannot arrive
          // pre-verified, whatever they send.
          verificationStatus: 'UNVERIFIED',
        },
      });

      const user = await tx.user.create({
        data: {
          firebaseUid: req.firebaseUid,
          name: input.contactName,
          email: input.contactEmail,
          phone: input.contactPhone,
          // Also server-controlled. The old Firestore signup let the
          // client pick its own role; nothing here reads a role from
          // the request body.
          role: 'BLOOD_BANK_STAFF',
          institutionId: institution.id,
        },
      });

      return { institution, user };
    });

    // Rules section 4: ids only, no names or contact details.
    log.info(
      { institutionId: result.institution.id, userId: result.user.id },
      'Institution applied, awaiting platform admin verification'
    );

    return res.status(201).json({
      institutionId: result.institution.id,
      name: result.institution.name,
      verificationStatus: result.institution.verificationStatus,
      message:
        'Thank you. A platform administrator will check your details before ' +
        'your blood bank can report usage or contact donors. You can sign in ' +
        'now and look around in the meantime.',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
