// Donor routes (F1 registration, F2 eligibility read).

import { Router } from 'express';
import { donorRegistrationSchema, donorPreferencesSchema } from '@rednexus/validators';
import { DONOR_STATUS, BLOOD_GROUP_LABELS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { computeEligibility, eligibilityMessage } from '../services/eligibility.service.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
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

/**
 * POST /api/donors - QR camp registration (F1).
 *
 * Public by design: the donor scans a QR at a camp and fills the form
 * before any account exists.
 */
router.post('/', async (req, res, next) => {
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
    const donor = await prisma.donor.create({
      data: {
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
