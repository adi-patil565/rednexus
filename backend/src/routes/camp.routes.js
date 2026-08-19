// Camp routes (F10).
//
// Listing is public. A donor browsing camps before they have an account
// is the normal path — the QR code on a camp banner is often the first
// thing they ever see of this platform, and requiring a login to answer
// "is there a camp near me" would put a wall in front of the recruiting
// funnel.
//
// Posting and cancelling require verified staff. Attending requires a
// donor account, because an attendance without a donor attached is not
// information.

import { Router } from 'express';
import { campCreateSchema, campQuerySchema } from '@rednexus/validators';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff } from '../middleware/loadUser.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('camp');
const router = Router();

const badRequest = (res, error) =>
  res.status(400).json({
    error: 'VALIDATION_FAILED',
    fields: error.errors.reduce((acc, e) => {
      acc[e.path.join('.')] = e.message;
      return acc;
    }, {}),
  });

const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const publicShape = (camp) => ({
  id: camp.id,
  title: camp.title,
  date: camp.date,
  timeNote: camp.timeNote,
  location: camp.location,
  pincode: camp.pincode,
  notes: camp.notes,
  bloodBank: camp.institution?.name ?? null,
  cancelled: camp.cancelledAt != null,
  // How many said they would try to come. A count, never a list -
  // who is attending a camp is nobody else's business (F7).
  interestedCount: camp._count?.attendances ?? 0,
});

// ============================================================
// Public
// ============================================================

// GET /api/camps?pincode=&days=
router.get('/', async (req, res, next) => {
  const parsed = campQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error);

  const until = startOfToday();
  until.setUTCDate(until.getUTCDate() + parsed.data.days);

  try {
    const camps = await prisma.camp.findMany({
      where: {
        date: { gte: startOfToday(), lte: until },
        cancelledAt: null,
        // Only camps from blood banks a platform admin has verified.
        // An unverified institution advertising a public event under
        // this platform's name is a trust problem, not a listing bug.
        institution: { verificationStatus: 'VERIFIED' },
        ...(parsed.data.pincode ? { pincode: parsed.data.pincode } : {}),
      },
      orderBy: { date: 'asc' },
      include: {
        institution: { select: { name: true } },
        _count: { select: { attendances: true } },
      },
    });

    return res.json({ camps: camps.map(publicShape) });
  } catch (error) {
    return next(error);
  }
});

// ============================================================
// Donor
// ============================================================

// POST /api/camps/:id/attend — toggle "I'll try to come".
//
// A toggle rather than separate add/remove endpoints: the donor-facing
// control is one button, and plans change.
router.post('/:id/attend', verifyFirebaseToken, async (req, res, next) => {
  try {
    const donor = await prisma.donor.findUnique({ where: { firebaseUid: req.firebaseUid } });
    if (!donor) {
      return res.status(403).json({
        error: 'NOT_A_DONOR',
        message: 'No donor record is linked to this account.',
      });
    }

    const camp = await prisma.camp.findUnique({ where: { id: req.params.id } });
    if (!camp || camp.cancelledAt) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Camp not found.' });
    }

    const existing = await prisma.campAttendance.findUnique({
      where: { campId_donorId: { campId: camp.id, donorId: donor.id } },
    });

    if (existing) {
      await prisma.campAttendance.delete({ where: { id: existing.id } });
      return res.json({
        attending: false,
        message: 'Removed. You can change your mind again any time.',
      });
    }

    await prisma.campAttendance.create({ data: { campId: camp.id, donorId: donor.id } });

    log.info({ campId: camp.id, donorId: donor.id }, 'Donor marked interest in camp');

    return res.json({
      attending: true,
      // Never phrased as a commitment. A camp tap that reads as a
      // promise is a tap people avoid making, and a soft signal many
      // give beats a firm one nobody does.
      message: 'Thanks — we have noted that you hope to come.',
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/camps/mine-attending — camps this donor said yes to.
router.get('/mine-attending', verifyFirebaseToken, async (req, res, next) => {
  try {
    const donor = await prisma.donor.findUnique({ where: { firebaseUid: req.firebaseUid } });
    if (!donor) return res.json({ campIds: [] });

    const rows = await prisma.campAttendance.findMany({
      where: { donorId: donor.id },
      select: { campId: true },
    });
    return res.json({ campIds: rows.map((r) => r.campId) });
  } catch (error) {
    return next(error);
  }
});

// ============================================================
// Staff
// ============================================================

// GET /api/camps/mine — this institution's camps, past and future.
router.get('/mine', verifyFirebaseToken, ...verifiedStaff, async (req, res, next) => {
  try {
    const camps = await prisma.camp.findMany({
      where: { institutionId: req.user.institutionId },
      orderBy: { date: 'desc' },
      include: {
        institution: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { attendances: true } },
      },
    });

    const today = startOfToday();

    return res.json({
      camps: camps.map((c) => ({
        ...publicShape(c),
        createdBy: c.createdBy?.name ?? null,
        past: c.date < today,
        // The QR code printed on the banner points here. Donors who
        // scan it arrive with registeredAtCampId already set, which is
        // what makes "did this camp actually recruit anyone" answerable.
        registrationPath: `/register?camp=${c.id}`,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/camps
router.post('/', verifyFirebaseToken, ...verifiedStaff, async (req, res, next) => {
  const parsed = campCreateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const camp = await prisma.camp.create({
      data: {
        institutionId: req.user.institutionId,
        title: parsed.data.title,
        date: parsed.data.date,
        timeNote: parsed.data.timeNote || null,
        location: parsed.data.location,
        pincode: parsed.data.pincode,
        notes: parsed.data.notes || null,
        createdByUserId: req.user.id,
      },
      include: { institution: { select: { name: true } } },
    });

    log.info(
      { campId: camp.id, institutionId: req.user.institutionId, userId: req.user.id },
      'Camp posted'
    );

    return res.status(201).json({
      ...publicShape(camp),
      registrationPath: `/register?camp=${camp.id}`,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/camps/:id/cancel
//
// Cancels rather than deletes. Donors who said they would come need to
// see that it is off, and a deleted row cannot tell them anything.
router.post('/:id/cancel', verifyFirebaseToken, ...verifiedStaff, async (req, res, next) => {
  try {
    const camp = await prisma.camp.findUnique({ where: { id: req.params.id } });
    if (!camp || camp.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Camp not found.' });
    }
    if (camp.cancelledAt) {
      return res.status(409).json({ error: 'ALREADY_CANCELLED', message: 'Already cancelled.' });
    }

    await prisma.camp.update({
      where: { id: camp.id },
      data: { cancelledAt: new Date() },
    });

    log.info({ campId: camp.id, userId: req.user.id }, 'Camp cancelled');

    return res.json({ id: camp.id, cancelled: true, message: 'Camp cancelled.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
