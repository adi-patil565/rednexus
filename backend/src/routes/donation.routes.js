// Donation recording and screening release.
//
// The two-step exists because blood is not stock the moment it is
// given. Recording a donation starts the eligibility clock immediately
// - that is about the donor - but the unit only counts toward supply
// once staff release it after TTI screening.

import { Router } from 'express';
import {
  donationRecordSchema,
  donationReleaseSchema,
} from '@rednexus/validators';
import { BLOOD_GROUP_LABELS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff } from '../middleware/loadUser.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('donation');
const router = Router();

router.use(verifyFirebaseToken, ...verifiedStaff);

const badRequest = (res, error) =>
  res.status(400).json({
    error: 'VALIDATION_FAILED',
    fields: error.errors.reduce((acc, e) => {
      acc[e.path.join('.')] = e.message;
      return acc;
    }, {}),
  });

// POST /api/donations
//
// Records that a donation happened. Two effects, deliberately split:
//
//   donor side  - lastDonationDate moves, so eligibility recalculates.
//                 There is no recalc job to run; eligibility is
//                 computed on read, so this is the whole of it.
//   supply side - nothing yet. The unit is PENDING_SCREENING and does
//                 not count toward stock until released.
router.post('/', async (req, res, next) => {
  const parsed = donationRecordSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  const input = parsed.data;
  const institutionId = req.user.institutionId;
  const donationDate = input.date ?? new Date();

  try {
    const donor = await prisma.donor.findUnique({ where: { id: input.donorId } });
    if (!donor) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Donor not found.' });
    }

    const [donation] = await prisma.$transaction([
      prisma.donationRecord.create({
        data: {
          donorId: donor.id,
          institutionId,
          date: donationDate,
          bloodGroupVerified: input.bloodGroupVerified ?? null,
          hbValue: input.hbValue ?? null,
          volumeMl: input.volumeMl ?? null,
          unitsContributed: input.unitsContributed,
          recordedByUserId: req.user.id,
          screeningStatus: 'PENDING_SCREENING',
        },
      }),

      prisma.donor.update({
        where: { id: donor.id },
        data: {
          lastDonationDate: donationDate,
          priorDonationCount: (donor.priorDonationCount ?? 0) + 1,
          // A first confirmed donation promotes a provisional record.
          // A donor held for review is NOT promoted here - only a human
          // clears that, and donating does not clear it.
          status: donor.status === 'PROVISIONAL' ? 'ACTIVE' : donor.status,
          // The blood centre's test result outranks the donor's claim.
          ...(input.bloodGroupVerified
            ? { bloodGroupVerified: input.bloodGroupVerified }
            : {}),
        },
      }),
    ]);

    log.info(
      { donationId: donation.id, donorId: donor.id, institutionId, userId: req.user.id },
      'Donation recorded, awaiting screening'
    );

    return res.status(201).json({
      id: donation.id,
      screeningStatus: donation.screeningStatus,
      message:
        'Donation recorded. It will count toward stock once screening is complete and staff release it.',
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/donations/pending
//
// Units awaiting release. Not stock - they cannot be issued - but staff
// need to see them, because "12 units clear tomorrow" changes whether
// today's shortfall is worth contacting donors about.
router.get('/pending', async (req, res, next) => {
  try {
    const rows = await prisma.donationRecord.findMany({
      where: { institutionId: req.user.institutionId, screeningStatus: 'PENDING_SCREENING' },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        bloodGroupVerified: true,
        unitsContributed: true,
        // Donor contact is deliberately absent. F7: contact details go
        // only to the institution coordinating a request they raised,
        // and this is not that.
        donorId: true,
      },
    });

    return res.json({
      pending: rows.map((r) => ({
        id: r.id,
        date: r.date,
        donorId: r.donorId,
        bloodGroup: r.bloodGroupVerified ? BLOOD_GROUP_LABELS[r.bloodGroupVerified] : null,
        units: r.unitsContributed,
        needsBloodGroup: r.bloodGroupVerified == null,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/donations/:id/release
//
// Staff record that screening is complete and the unit is on the shelf.
// The app is not judging a screening result - it is recording that a
// human released it (Rules section 1).
router.post('/:id/release', async (req, res, next) => {
  const parsed = donationReleaseSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const donation = await prisma.donationRecord.findUnique({ where: { id: req.params.id } });

    if (!donation || donation.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Donation not found.' });
    }

    if (donation.screeningStatus !== 'PENDING_SCREENING') {
      // Releasing twice would credit the same unit to stock twice.
      return res.status(409).json({
        error: 'ALREADY_RESOLVED',
        message: `This donation is already ${donation.screeningStatus.toLowerCase()}.`,
      });
    }

    const updated = await prisma.donationRecord.update({
      where: { id: donation.id },
      data: {
        screeningStatus: 'RELEASED',
        releasedAt: new Date(),
        screenedByUserId: req.user.id,
        bloodGroupVerified: parsed.data.bloodGroupVerified,
      },
    });

    log.info(
      {
        donationId: updated.id,
        institutionId: req.user.institutionId,
        userId: req.user.id,
        bloodGroup: updated.bloodGroupVerified,
      },
      'Donation released to stock'
    );

    return res.json({
      id: updated.id,
      screeningStatus: updated.screeningStatus,
      bloodGroup: BLOOD_GROUP_LABELS[updated.bloodGroupVerified],
      units: updated.unitsContributed,
      message: `${updated.unitsContributed} unit of ${BLOOD_GROUP_LABELS[updated.bloodGroupVerified]} added to stock.`,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/donations/:id/discard
//
// No reason is recorded. Why a unit failed screening is a medical fact
// about a named donor; the blood centre keeps that on paper.
router.post('/:id/discard', async (req, res, next) => {
  try {
    const donation = await prisma.donationRecord.findUnique({ where: { id: req.params.id } });

    if (!donation || donation.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Donation not found.' });
    }

    if (donation.screeningStatus !== 'PENDING_SCREENING') {
      return res.status(409).json({
        error: 'ALREADY_RESOLVED',
        message: `This donation is already ${donation.screeningStatus.toLowerCase()}.`,
      });
    }

    await prisma.donationRecord.update({
      where: { id: donation.id },
      data: {
        screeningStatus: 'DISCARDED',
        screenedByUserId: req.user.id,
      },
    });

    log.info(
      { donationId: donation.id, institutionId: req.user.institutionId, userId: req.user.id },
      'Donation discarded after screening'
    );

    return res.json({ id: donation.id, screeningStatus: 'DISCARDED' });
  } catch (error) {
    return next(error);
  }
});

export default router;
