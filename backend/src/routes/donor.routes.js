// Donor routes (F1 registration, F2 eligibility read).

import { Router } from 'express';
import { donorRegistrationSchema } from '@rednexus/validators';
import { DONOR_STATUS, BLOOD_GROUP_LABELS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { computeEligibility, eligibilityMessage } from '../services/eligibility.service.js';
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
