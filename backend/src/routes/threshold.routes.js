// Threshold routes (T2 / T3 / T4).
//
// GET  /api/thresholds                  recompute proposals, show state
// POST /api/thresholds/:group/confirm   the human gate
// GET  /api/thresholds/breaches         confirmed thresholds vs stock

import { Router } from 'express';
import {
  thresholdConfirmSchema,
  bloodGroupParamSchema,
  thresholdQuerySchema,
} from '@rednexus/validators';
import { BLOOD_GROUP_LABELS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff } from '../middleware/loadUser.js';
import { proposeForInstitution, checkBreach } from '../services/threshold.service.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('threshold');
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

// GET /api/thresholds
//
// Recomputes proposals from the trailing usage window and returns them
// alongside whatever is currently confirmed. Proposals refresh on read;
// confirmed values are never touched here, so a proposal changing does
// not silently change what is active. Staff must confirm again.
router.get('/', async (req, res, next) => {
  const parsed = thresholdQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error);

  const { windowDays } = parsed.data;
  const institutionId = req.user.institutionId;

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));

  try {
    const records = await prisma.usageRecord.findMany({
      where: { institutionId, date: { gte: since } },
      select: { bloodGroup: true, unitsIssued: true, date: true },
    });

    const proposals = proposeForInstitution(records, windowDays);

    // Persist proposals so the confirmation screen and any later audit
    // agree on exactly which numbers were shown to the person who
    // confirmed. Only proposal columns are written.
    const saved = await prisma.$transaction(
      proposals.map((p) =>
        prisma.bloodGroupThreshold.upsert({
          where: {
            institutionId_bloodGroup: { institutionId, bloodGroup: p.bloodGroup },
          },
          update: {
            proposedThreshold: p.proposedThreshold,
            proposedCollectionTarget: p.proposedCollectionTarget,
            meanDailyUsage: p.meanDailyUsage,
            stdDevDailyUsage: p.stdDevDailyUsage,
            computationBasis: p.computationBasis,
            daysOfData: p.daysOfData,
            windowDays: p.windowDays,
            confidence: p.confidence,
            proposedAt: new Date(),
          },
          create: { institutionId, bloodGroup: p.bloodGroup, ...p },
          include: { confirmedBy: { select: { id: true, name: true } } },
        })
      )
    );

    return res.json({
      institutionId,
      windowDays,
      thresholds: saved.map((t) => ({
        bloodGroup: BLOOD_GROUP_LABELS[t.bloodGroup],
        bloodGroupValue: t.bloodGroup,

        proposed: {
          threshold: t.proposedThreshold,
          weeklyCollectionTarget: t.proposedCollectionTarget,
          meanDailyUsage: Number(t.meanDailyUsage),
          confidence: t.confidence,
          daysOfData: t.daysOfData,
          // Shown next to the number in the UI so confirming is a
          // judgement rather than a reflex.
          basis: t.computationBasis,
        },

        // null means NOT ACTIVE. Nothing downstream may treat a
        // proposal as though it were confirmed.
        active:
          t.confirmedThreshold == null
            ? null
            : {
                threshold: t.confirmedThreshold,
                weeklyCollectionTarget: t.confirmedCollectionTarget,
                confirmedBy: t.confirmedBy ? t.confirmedBy.name : null,
                confirmedAt: t.confirmedAt,
                wasEdited: t.wasEdited,
              },

        needsConfirmation: t.confirmedThreshold == null,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/thresholds/breaches
//
// Current stock against CONFIRMED thresholds only. Groups with no
// confirmed threshold are reported as unmonitored rather than assumed
// healthy - "no opinion" and "fine" look identical if you collapse them.
//
// Declared before the :bloodGroup route so "breaches" is not captured
// as a blood group parameter.
router.get('/breaches', async (req, res, next) => {
  const institutionId = req.user.institutionId;

  try {
    const thresholds = await prisma.bloodGroupThreshold.findMany({
      where: { institutionId },
    });

    const latest = await prisma.usageRecord.findMany({
      where: { institutionId },
      orderBy: { date: 'desc' },
      distinct: ['bloodGroup'],
      select: { bloodGroup: true, stockOnHand: true, date: true },
    });
    const stockByGroup = new Map(latest.map((r) => [r.bloodGroup, r]));

    const breaches = [];
    const unmonitored = [];

    for (const t of thresholds) {
      const stock = stockByGroup.get(t.bloodGroup);
      const result = checkBreach(t, stock ? stock.stockOnHand : 0);

      if (result === null) {
        unmonitored.push(BLOOD_GROUP_LABELS[t.bloodGroup]);
        continue;
      }
      if (result.inBreach) {
        breaches.push({
          bloodGroup: BLOOD_GROUP_LABELS[t.bloodGroup],
          currentStock: result.currentStock,
          confirmedThreshold: result.confirmedThreshold,
          shortfall: result.shortfall,
          asOf: stock ? stock.date : null,
        });
      }
    }

    return res.json({
      institutionId,
      breaches,
      // No request is created here. T5 drafting and the DETECTED ->
      // RAISED gate are Phase 5; this endpoint only reports.
      unmonitoredBloodGroups: unmonitored,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/thresholds/:bloodGroup/confirm
//
// The gate. One blood group at a time, by a named staff member at that
// institution, recorded with who and when.
router.post('/:bloodGroup/confirm', async (req, res, next) => {
  const params = bloodGroupParamSchema.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);

  const body = thresholdConfirmSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);

  const { bloodGroup } = params.data;
  const institutionId = req.user.institutionId;

  try {
    const existing = await prisma.bloodGroupThreshold.findUnique({
      where: { institutionId_bloodGroup: { institutionId, bloodGroup } },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'NO_PROPOSAL',
        message: 'No proposal exists for this blood group yet.',
      });
    }

    const wasEdited =
      body.data.confirmedThreshold !== existing.proposedThreshold ||
      body.data.confirmedCollectionTarget !== existing.proposedCollectionTarget;

    const updated = await prisma.bloodGroupThreshold.update({
      where: { institutionId_bloodGroup: { institutionId, bloodGroup } },
      data: {
        confirmedThreshold: body.data.confirmedThreshold,
        confirmedCollectionTarget: body.data.confirmedCollectionTarget,
        // The audit trail. Architecture.md section 3: this is the
        // evidence the human-in-the-loop guarantee is real rather than
        // a UI label.
        confirmedByUserId: req.user.id,
        confirmedAt: new Date(),
        wasEdited,
      },
      include: { confirmedBy: { select: { name: true } } },
    });

    log.info(
      {
        institutionId,
        bloodGroup,
        userId: req.user.id,
        threshold: updated.confirmedThreshold,
        target: updated.confirmedCollectionTarget,
        wasEdited,
      },
      'Threshold confirmed'
    );

    return res.json({
      bloodGroup: BLOOD_GROUP_LABELS[bloodGroup],
      threshold: updated.confirmedThreshold,
      weeklyCollectionTarget: updated.confirmedCollectionTarget,
      confirmedBy: updated.confirmedBy ? updated.confirmedBy.name : null,
      confirmedAt: updated.confirmedAt,
      wasEdited,
      message: 'Threshold for ' + BLOOD_GROUP_LABELS[bloodGroup] + ' is now active.',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
