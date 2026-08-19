// Recurring transfusion schedules (N1).
//
// Every route requires verified blood bank staff. Patients do not have
// accounts here and are never contacted by this platform — a schedule
// is the blood bank's own record of a commitment it has made, and the
// platform's job is to make sure donors are lined up before the date
// arrives.

import { Router } from 'express';
import { scheduleCreateSchema, scheduleUpdateSchema } from '@rednexus/validators';
import { BLOOD_GROUP_LABELS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff } from '../middleware/loadUser.js';
import {
  draftUpcomingTransfusions,
  completeTransfusion,
  coverageFor,
  daysUntilDue,
  FREQUENCY_DAYS,
} from '../services/recurring.service.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('recurring-routes');
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

const FREQUENCY_LABEL = {
  WEEKLY: 'Every week',
  FORTNIGHTLY: 'Every 2 weeks',
  MONTHLY: 'Every month',
  EVERY_SIX_WEEKS: 'Every 6 weeks',
};

// GET /api/schedules
router.get('/', async (req, res, next) => {
  try {
    const schedules = await prisma.recurringSchedule.findMany({
      where: { institutionId: req.user.institutionId },
      orderBy: [{ active: 'desc' }, { nextDueDate: 'asc' }],
      include: { createdBy: { select: { name: true } } },
    });

    // Coverage is a per-schedule query; these lists are small (a blood
    // bank has tens of recurring patients, not thousands).
    const withCoverage = await Promise.all(
      schedules.map(async (s) => ({
        id: s.id,
        patientRef: s.patientRef,
        bloodGroup: BLOOD_GROUP_LABELS[s.bloodGroup],
        bloodGroupValue: s.bloodGroup,
        unitsPerVisit: s.unitsPerVisit,
        frequency: s.frequency,
        frequencyLabel: FREQUENCY_LABEL[s.frequency],
        everyDays: FREQUENCY_DAYS[s.frequency],
        nextDueDate: s.nextDueDate,
        daysUntilDue: daysUntilDue(s),
        leadDays: s.leadDays,
        active: s.active,
        createdBy: s.createdBy?.name ?? null,
        coverage: await coverageFor(prisma, s),
      }))
    );

    return res.json({ schedules: withCoverage });
  } catch (error) {
    return next(error);
  }
});

// POST /api/schedules
router.post('/', async (req, res, next) => {
  const parsed = scheduleCreateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const schedule = await prisma.recurringSchedule.create({
      data: {
        institutionId: req.user.institutionId,
        createdByUserId: req.user.id,
        ...parsed.data,
      },
    });

    // Rules section 4: no PII in logs. patientRef is an opaque
    // reference rather than an identity, but it is still the blood
    // bank's key to a real person, so it is not logged either.
    log.info(
      { scheduleId: schedule.id, institutionId: req.user.institutionId, userId: req.user.id },
      'Recurring schedule created'
    );

    return res.status(201).json({ id: schedule.id, patientRef: schedule.patientRef });
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/schedules/:id
router.patch('/:id', async (req, res, next) => {
  const parsed = scheduleUpdateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const existing = await prisma.recurringSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Schedule not found.' });
    }

    const data = { ...parsed.data };
    // Stopping a schedule is a real event with a date, not a deletion.
    // A patient's course ending is something the blood bank may need to
    // look back at.
    if (data.active === false && existing.active) data.endedAt = new Date();
    if (data.active === true) data.endedAt = null;

    const updated = await prisma.recurringSchedule.update({
      where: { id: existing.id },
      data,
    });

    return res.json({ id: updated.id, active: updated.active, nextDueDate: updated.nextDueDate });
  } catch (error) {
    return next(error);
  }
});

// POST /api/schedules/arrange
//
// Drafts requests for every schedule inside its lead window. Creates
// DETECTED rows and notifies nobody - the same gate as a threshold
// breach. A predictable need is still a need a human approves.
router.post('/arrange', async (req, res, next) => {
  try {
    const drafted = await draftUpcomingTransfusions(prisma, req.user.institutionId);
    return res.json({
      drafted: drafted.length,
      message:
        drafted.length === 0
          ? 'No transfusions are close enough to start arranging donors.'
          : `${drafted.length} drafted. None have been sent — each needs your approval.`,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/schedules/:id/complete
router.post('/:id/complete', async (req, res, next) => {
  try {
    const existing = await prisma.recurringSchedule.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Schedule not found.' });
    }

    const updated = await completeTransfusion(prisma, existing.id);

    return res.json({
      id: updated.id,
      nextDueDate: updated.nextDueDate,
      message: `Recorded. Next transfusion due ${updated.nextDueDate.toISOString().slice(0, 10)}.`,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: 'NOT_FOUND', message: error.message });
    }
    return next(error);
  }
});

export default router;
