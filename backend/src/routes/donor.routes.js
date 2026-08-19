// Donor routes (F1 registration, F2 eligibility read).

import { Router } from 'express';
import {
  donorRegistrationSchema,
  donorPreferencesSchema,
  donorStaffUpdateSchema,
} from '@rednexus/validators';
import { DONOR_STATUS, BLOOD_GROUP_LABELS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { computeEligibility, eligibilityMessage } from '../services/eligibility.service.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff } from '../middleware/loadUser.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('donor');
const router = Router();

// Recorded on every donor record for DPDP Act purpose limitation.
const CONSENT_PURPOSE =
  'Contact for voluntary blood donation requests and eligibility reminders';

/**
 * Public, non-PII projection of a donor.
 *
 * F7: donor contact details are never exposed to patients, families, or
 * any unverified party - only to the verified institution coordinating a
 * request. Name, phone, email and date of birth are therefore absent
 * here by design, not by oversight.
 */
const publicView = (donor, today = new Date()) => {
  const eligibility = computeEligibility(donor, today);
  return {
    id: donor.id,
    bloodGroup: BLOOD_GROUP_LABELS[donor.bloodGroupSelfReported],
    bloodGroupVerified: donor.bloodGroupVerified
      ? BLOOD_GROUP_LABELS[donor.bloodGroupVerified]
      : null,
    areaPincode: donor.areaPincode,
    status: donor.status,
    eligible: eligibility.eligible,
    eligibleFrom: eligibility.eligibleFrom,
    message: eligibilityMessage(eligibility, today),
  };
};

/**
 * Resolve the signed-in donor, or 403.
 *
 * A donor may only ever read their own record through these routes -
 * there is no id parameter to change.
 */
const requireDonor = async (req, res, next) => {
  try {
    const donor = await prisma.donor.findUnique({ where: { firebaseUid: req.firebaseUid } });
    if (!donor) {
      return res.status(403).json({
        error: 'NOT_A_DONOR',
        message: 'No donor record is linked to this account.',
      });
    }
    req.donor = donor;
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/donors/me/alerts - requests this donor has been asked about.
 *
 * Shows what is needed and where, never who it is for. Rules section 1:
 * requests are institution-mediated, and a donor learning the patient's
 * identity is the direct donor-to-family channel the platform exists to
 * avoid.
 */
router.get('/me/alerts', verifyFirebaseToken, requireDonor, async (req, res, next) => {
  try {
    const logs = await prisma.notificationLog.findMany({
      where: { donorId: req.donor.id },
      orderBy: { sentAt: 'desc' },
      take: 25,
      include: {
        request: {
          include: { institution: { select: { name: true, pincode: true } } },
        },
      },
    });

    return res.json({
      alerts: logs.map((l) => ({
        requestId: l.requestId,
        bloodGroup: BLOOD_GROUP_LABELS[l.request.bloodGroup],
        unitsNeeded: l.request.unitsNeeded,
        urgent: l.request.urgent,
        bloodBank: l.request.institution.name,
        area: l.request.institution.pincode,
        sentAt: l.sentAt,
        response: l.response,
        respondedAt: l.respondedAt,
        // Only a live request can still be answered.
        canRespond:
          l.response === 'PENDING' &&
          !['CLOSED', 'CANCELLED'].includes(l.request.state),
        requestState: l.request.state,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/donors/me/donations - the donor's own history (F8).
 */
router.get('/me/donations', verifyFirebaseToken, requireDonor, async (req, res, next) => {
  try {
    const donations = await prisma.donationRecord.findMany({
      where: { donorId: req.donor.id },
      orderBy: { date: 'desc' },
      include: { institution: { select: { name: true } } },
    });

    return res.json({
      donations: donations.map((d) => ({
        id: d.id,
        date: d.date,
        bloodBank: d.institution.name,
        // Hb trend, per F8. Shown as the recorded number without
        // interpretation - the app does not tell anyone what it means.
        hbValue: d.hbValue ? Number(d.hbValue) : null,
        units: d.unitsContributed,
      })),
      total: donations.length,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /api/donors/me/preferences - pause and channel (F3).
 *
 * Pause is absolute once set; nothing in the notification engine
 * overrides it, however urgent a request is.
 */
router.patch('/me/preferences', verifyFirebaseToken, requireDonor, async (req, res, next) => {
  const parsed = donorPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      fields: parsed.error.errors.reduce((acc, e) => {
        acc[e.path.join('.')] = e.message;
        return acc;
      }, {}),
    });
  }

  try {
    const updated = await prisma.donor.update({
      where: { id: req.donor.id },
      data: parsed.data,
    });

    log.info(
      { donorId: updated.id, paused: updated.notificationsPaused },
      'Donor preferences updated'
    );

    return res.json({
      notificationsPaused: updated.notificationsPaused,
      preferredChannel: updated.preferredChannel,
      message: updated.notificationsPaused
        ? 'You will not be contacted until you turn this back on.'
        : 'You will be contacted when blood of your group is needed nearby.',
    });
  } catch (error) {
    return next(error);
  }
});

// ============================================================
// Staff-facing donor management.
//
// Contact details ARE returned here, unlike the public projection.
// F7 restricts donor contact to verified institutions; blood bank staff
// reviewing their own donor pool are exactly who it is for. Everything
// below requires verified staff.
// ============================================================

/**
 * GET /api/donors/review-queue
 *
 * Donors who answered YES to "have you ever been advised not to donate
 * blood?" and are held until a human clears them. The app never asks
 * why and never shows a reason, because it never collected one - the
 * question routes the person to a conversation, not to a record.
 */
router.get(
  '/review-queue',
  verifyFirebaseToken,
  ...verifiedStaff,
  async (req, res, next) => {
    try {
      const donors = await prisma.donor.findMany({
        where: { status: 'PENDING_REVIEW' },
        orderBy: { createdAt: 'asc' },
      });

      return res.json({
        donors: donors.map((d) => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          bloodGroup: BLOOD_GROUP_LABELS[d.bloodGroupSelfReported],
          areaPincode: d.areaPincode,
          registeredAt: d.createdAt,
          registeredAtCampId: d.registeredAtCampId,
        })),
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * POST /api/donors/:id/clear-review
 *
 * A staff member has spoken to this donor and is satisfied they may be
 * contacted. Moves PENDING_REVIEW to ACTIVE.
 *
 * Note what is not stored: any reason, any medical detail, any note.
 * Rules section 1 keeps the app out of medical judgements, and a
 * free-text box here would quietly become a health record.
 */
router.post(
  '/:id/clear-review',
  verifyFirebaseToken,
  ...verifiedStaff,
  async (req, res, next) => {
    try {
      const donor = await prisma.donor.findUnique({ where: { id: req.params.id } });
      if (!donor) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Donor not found.' });
      }
      if (donor.status !== 'PENDING_REVIEW') {
        return res.status(409).json({
          error: 'NOT_UNDER_REVIEW',
          message: 'This donor is not waiting for review.',
        });
      }

      const updated = await prisma.donor.update({
        where: { id: donor.id },
        data: { status: 'ACTIVE', deferralSetByUserId: req.user.id, deferralSetAt: new Date() },
      });

      log.info(
        { donorId: updated.id, userId: req.user.id, institutionId: req.user.institutionId },
        'Donor cleared for contact after review'
      );

      return res.json({
        id: updated.id,
        status: updated.status,
        message: 'This donor can now be contacted when blood of their group is needed.',
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * PATCH /api/donors/:id/staff
 *
 * Set the verified blood group, or record a deferral from the paper
 * form's page 4 Outcome field.
 *
 * The form's accompanying "Reasons for Deferral" free text is
 * deliberately not accepted. A permanent deferral sets the status; a
 * temporary one sets a date. Neither stores why.
 */
router.patch(
  '/:id/staff',
  verifyFirebaseToken,
  ...verifiedStaff,
  async (req, res, next) => {
    const parsed = donorStaffUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_FAILED',
        fields: parsed.error.errors.reduce((acc, e) => {
          acc[e.path.join('.')] = e.message;
          return acc;
        }, {}),
      });
    }

    try {
      const donor = await prisma.donor.findUnique({ where: { id: req.params.id } });
      if (!donor) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Donor not found.' });
      }

      const data = { ...parsed.data };
      if (data.deferralType || data.deferralUntilDate) {
        data.deferralSetByUserId = req.user.id;
        data.deferralSetAt = new Date();
      }
      if (data.deferralType === 'PERMANENT') {
        data.status = 'PERMANENTLY_DEFERRED';
        data.deferralUntilDate = null;
      }

      const updated = await prisma.donor.update({ where: { id: donor.id }, data });

      log.info(
        { donorId: updated.id, userId: req.user.id, deferralType: updated.deferralType ?? null },
        'Donor record updated by staff'
      );

      return res.json(publicView(updated));
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /api/donors/search?phone= or ?pincode=
 *
 * Deliberately requires a search term. Returning the whole donor list
 * with contact details on an empty query would turn a lookup tool into
 * a bulk export.
 */
router.get('/search', verifyFirebaseToken, ...verifiedStaff, async (req, res, next) => {
  const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
  const pincode = typeof req.query.pincode === 'string' ? req.query.pincode.trim() : '';

  if (!phone && !pincode) {
    return res.status(400).json({
      error: 'SEARCH_TERM_REQUIRED',
      message: 'Enter a phone number or PIN code to search.',
    });
  }

  try {
    const donors = await prisma.donor.findMany({
      where: {
        ...(phone ? { phone: { contains: phone } } : {}),
        ...(pincode ? { areaPincode: pincode } : {}),
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      donors: donors.map((d) => {
        const eligibility = computeEligibility(d);
        return {
          id: d.id,
          name: d.name,
          phone: d.phone,
          bloodGroup: BLOOD_GROUP_LABELS[d.bloodGroupSelfReported],
          bloodGroupVerified: d.bloodGroupVerified
            ? BLOOD_GROUP_LABELS[d.bloodGroupVerified]
            : null,
          areaPincode: d.areaPincode,
          status: d.status,
          eligible: eligibility.eligible,
          eligibleFrom: eligibility.eligibleFrom,
          deferralUntilDate: d.deferralUntilDate,
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/donors - QR camp registration (F1).
 *
 * Public by design: the donor scans a QR at a camp and fills the form
 * before any account exists.
 */
router.post('/', optionalAuth, async (req, res, next) => {
  const parsed = donorRegistrationSchema.safeParse(req.body);

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

  // Q1.5 "Have you ever been advised not to donate blood?"
  // YES holds the record for a human to clear. The app never tries to
  // interpret the reason - it routes to a person, mirroring how the
  // paper form defers this exact question to the doctor present.
  const status = input.advisedNotToDonate
    ? DONOR_STATUS.PENDING_REVIEW
    : DONOR_STATUS.PROVISIONAL;

  try {
    // Link the record to the account that just registered, if there is
    // one. Without this a donor can register and then never sign in to
    // see the alerts they registered to receive - which was true until
    // this line existed.
    if (req.firebaseUid) {
      const taken = await prisma.donor.findUnique({ where: { firebaseUid: req.firebaseUid } });
      if (taken) {
        return res.status(409).json({
          error: 'ALREADY_REGISTERED',
          message: 'This account is already registered as a donor.',
        });
      }
    }

    const donor = await prisma.donor.create({
      data: {
        firebaseUid: req.firebaseUid ?? null,
        name: input.name,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
        phone: input.phone,
        email: input.email || null,
        areaPincode: input.areaPincode,
        bloodGroupSelfReported: input.bloodGroupSelfReported,
        donatedBefore: input.donatedBefore,
        priorDonationCount: input.priorDonationCount ?? null,
        lastDonationDate: input.lastDonationDate ?? null,
        donationType: input.donationType,
        patientName: input.patientName || null,
        advisedNotToDonateFlag: input.advisedNotToDonate,
        status,
        consentAt: new Date(),
        consentPurpose: CONSENT_PURPOSE,
        notifyAbnormalResults: input.notifyAbnormalResults,
        preferredChannel: input.preferredChannel,
        registeredAtCampId: input.registeredAtCampId ?? null,
      },
    });

    // Rules section 4: IDs only, never names or phone numbers.
    log.info({ donorId: donor.id, status: donor.status }, 'Donor registered');

    return res.status(201).json({
      id: donor.id,
      status: donor.status,
      message:
        status === DONOR_STATUS.PENDING_REVIEW
          ? 'Thank you for registering. Blood bank staff will check your details before you receive any requests.'
          : 'Thank you for registering. You will be contacted when blood of your group is needed nearby.',
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/donors/:id - eligibility summary.
 *
 * Returns the non-PII projection only. A staff-authenticated route
 * exposing contact details, scoped to a request the institution raised,
 * arrives with the notification pipeline in Stage 5.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const donor = await prisma.donor.findUnique({ where: { id: req.params.id } });
    if (!donor) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Donor not found.' });
    }
    return res.json(publicView(donor));
  } catch (error) {
    return next(error);
  }
});

export { publicView };
export default router;
