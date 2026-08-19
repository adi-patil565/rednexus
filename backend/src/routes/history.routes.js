// Confirmation history — the audit trail.
//
// Architecture.md section 3: "every DETECTED -> RAISED transition and
// every threshold confirmation must record who confirmed it and when.
// This is the evidence the human-in-the-loop guarantee is real, not
// just a UI label."
//
// This route is that evidence made visible. Everywhere else in the
// product the guarantee is enforced; here it is auditable, which is a
// different and equally necessary thing. Read-only by construction -
// there is no endpoint to edit or delete an entry.

import { Router } from 'express';
import { BLOOD_GROUP_LABELS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff } from '../middleware/loadUser.js';

const router = Router();
router.use(verifyFirebaseToken, ...verifiedStaff);

// GET /api/history
router.get('/', async (req, res, next) => {
  const institutionId = req.user.institutionId;

  try {
    const [thresholds, requests] = await Promise.all([
      prisma.bloodGroupThreshold.findMany({
        where: { institutionId, confirmedAt: { not: null } },
        include: { confirmedBy: { select: { name: true } } },
      }),
      prisma.request.findMany({
        where: { institutionId, confirmedAt: { not: null } },
        include: { confirmedBy: { select: { name: true } } },
        orderBy: { confirmedAt: 'desc' },
        take: 100,
      }),
    ]);

    const entries = [
      ...thresholds.map((t) => ({
        kind: 'THRESHOLD',
        at: t.confirmedAt,
        by: t.confirmedBy ? t.confirmedBy.name : 'a staff member',
        bloodGroup: BLOOD_GROUP_LABELS[t.bloodGroup],
        summary:
          `Set the minimum stock for ${BLOOD_GROUP_LABELS[t.bloodGroup]} to ` +
          `${t.confirmedThreshold} units, collecting ${t.confirmedCollectionTarget} a week.`,
        // Whether they took the suggested number or overrode it. A
        // proposal that is always edited is a formula worth revisiting.
        adjusted: t.wasEdited,
      })),
      ...requests.map((r) => ({
        kind: 'REQUEST',
        at: r.confirmedAt,
        by: r.confirmedBy ? r.confirmedBy.name : 'a staff member',
        bloodGroup: BLOOD_GROUP_LABELS[r.bloodGroup],
        summary:
          r.origin === 'MANUAL'
            ? `Raised a request for ${r.unitsNeeded} units of ${BLOOD_GROUP_LABELS[r.bloodGroup]}.`
            : `Approved contacting donors for ${r.unitsNeeded} units of ${BLOOD_GROUP_LABELS[r.bloodGroup]}.`,
        origin: r.origin,
        state: r.state,
        basis: r.detectionBasis,
      })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));

    return res.json({ entries: entries.slice(0, 150) });
  } catch (error) {
    return next(error);
  }
});

export default router;
