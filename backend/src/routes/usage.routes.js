// Usage reporting routes (T1).
//
// Every route here requires a verified blood bank staff account. An
// unverified institution cannot report usage - Rules section 2, no
// bypass, no environment flag.

import { Router } from 'express';
import { usageReportSchema, usageQuerySchema } from '@rednexus/validators';
import { BLOOD_GROUP_LABELS, BLOOD_GROUPS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff } from '../middleware/loadUser.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('usage');
const router = Router();

/** Strip time so a date is a calendar day, matching the @db.Date column. */
const asDay = (value) => {
  const d = value ? new Date(value) : new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

router.use(verifyFirebaseToken, ...verifiedStaff);

/**
 * POST /api/usage — submit one day's report for the whole institution.
 *
 * Upserts on (institution, blood group, date), so re-reporting a day is
 * a correction rather than a duplicate. That matters because the entry
 * screen deliberately shows the last 7 days so yesterday's typo is easy
 * to catch and fix.
 */
router.post('/', async (req, res, next) => {
  const parsed = usageReportSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      fields: parsed.error.errors.reduce((acc, e) => {
        acc[e.path.join('.')] = e.message;
        return acc;
      }, {}),
    });
  }

  const { date, entries } = parsed.data;
  const day = asDay(date);
  const institutionId = req.user.institutionId;

  try {
    // One transaction: a partially-written day would silently skew the
    // rolling average that every threshold is derived from.
    const written = await prisma.$transaction(
      entries.map((e) =>
        prisma.usageRecord.upsert({
          where: {
            institutionId_bloodGroup_date: {
              institutionId,
              bloodGroup: e.bloodGroup,
              date: day,
            },
          },
          update: {
            unitsIssued: e.unitsIssued,
            stockOnHand: e.stockOnHand,
            prbcUnits: e.prbcUnits ?? null,
            ffpUnits: e.ffpUnits ?? null,
            plateletUnits: e.plateletUnits ?? null,
            reportedByUserId: req.user.id,
          },
          create: {
            institutionId,
            bloodGroup: e.bloodGroup,
            date: day,
            unitsIssued: e.unitsIssued,
            stockOnHand: e.stockOnHand,
            prbcUnits: e.prbcUnits ?? null,
            ffpUnits: e.ffpUnits ?? null,
            plateletUnits: e.plateletUnits ?? null,
            reportedByUserId: req.user.id,
          },
        })
      )
    );

    log.info(
      {
        institutionId,
        userId: req.user.id,
        date: day.toISOString().slice(0, 10),
        groups: written.length,
      },
      'Usage reported'
    );

    return res.status(201).json({
      date: day.toISOString().slice(0, 10),
      recorded: written.length,
      totalUnitsIssued: written.reduce((sum, r) => sum + r.unitsIssued, 0),
      message: 'Usage recorded. Thank you.',
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /api/usage?days=7 — recent history for this institution.
 *
 * Shaped for the entry screen: one row per date, all eight blood groups
 * on it, so the last week reads as a grid without the client having to
 * pivot it.
 */
router.get('/', async (req, res, next) => {
  const parsed = usageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_FAILED', message: 'Invalid days parameter.' });
  }

  const since = asDay(new Date());
  since.setUTCDate(since.getUTCDate() - (parsed.data.days - 1));

  try {
    const records = await prisma.usageRecord.findMany({
      where: { institutionId: req.user.institutionId, date: { gte: since } },
      orderBy: [{ date: 'desc' }, { bloodGroup: 'asc' }],
    });

    const byDate = new Map();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, { date: key, groups: {}, totalIssued: 0 });
      const row = byDate.get(key);
      row.groups[BLOOD_GROUP_LABELS[r.bloodGroup]] = {
        unitsIssued: r.unitsIssued,
        stockOnHand: r.stockOnHand,
      };
      row.totalIssued += r.unitsIssued;
    }

    // Which of the requested days have no report at all. PRD section 10
    // says never block on missing data - surface it instead, so the
    // staleness is visible rather than silently degrading the average.
    const reported = new Set(byDate.keys());
    const missing = [];
    for (let i = 0; i < parsed.data.days; i += 1) {
      const d = asDay(new Date());
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (!reported.has(key)) missing.push(key);
    }

    return res.json({
      institutionId: req.user.institutionId,
      days: parsed.data.days,
      bloodGroups: BLOOD_GROUPS.map((g) => BLOOD_GROUP_LABELS[g]),
      history: [...byDate.values()],
      missingDates: missing,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
