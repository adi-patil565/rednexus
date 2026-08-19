// Platform admin routes.
//
// Narrow on purpose. An admin decides WHICH blood banks exist on the
// platform; they do not run one. Confirming a threshold or approving an
// alert belongs to the institution's own staff, and there is no
// endpoint here that lets an admin do either.
//
// Replaces the hardcoded mocks that previously answered these paths
// with invented numbers - including an unauthenticated
// PUT /api/admin/institutions/:id/verify that anyone could call.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { loadUser, requireRole } from '../middleware/loadUser.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('admin');
const router = Router();

router.use(verifyFirebaseToken, loadUser, requireRole('PLATFORM_ADMIN'));

const decisionSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
});

const shape = (i) => ({
  id: i.id,
  name: i.name,
  category: i.category,
  linkedHospitalName: i.linkedHospitalName,
  pincode: i.pincode,
  address: i.address,
  verificationStatus: i.verificationStatus,
  verifiedAt: i.verifiedAt,
  verifiedBy: i.verifiedBy ? i.verifiedBy.name : null,
  staffCount: i._count ? i._count.staff : undefined,
  createdAt: i.createdAt,
});

// GET /api/admin/institutions?status=UNVERIFIED
router.get('/institutions', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status) where.verificationStatus = req.query.status;

    const institutions = await prisma.institution.findMany({
      where,
      orderBy: [{ verificationStatus: 'asc' }, { createdAt: 'desc' }],
      include: {
        verifiedBy: { select: { name: true } },
        _count: { select: { staff: true } },
      },
    });

    return res.json({ institutions: institutions.map(shape) });
  } catch (error) {
    return next(error);
  }
});

// GET /api/admin/institutions/:id
router.get('/institutions/:id', async (req, res, next) => {
  try {
    const institution = await prisma.institution.findUnique({
      where: { id: req.params.id },
      include: {
        verifiedBy: { select: { name: true } },
        _count: { select: { staff: true } },
        staff: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!institution) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Institution not found.' });
    }

    return res.json({
      ...shape(institution),
      // Shown so the reviewer can see there IS a named person who will
      // be accountable for this institution's confirmations.
      staff: institution.staff,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/admin/institutions/:id/decision
//
// Verification cannot complete without at least one BLOOD_BANK_STAFF
// account (Phase 3's done-when). That is not bureaucratic: every
// threshold confirmation and every alert approval must be attributable
// to a named person at that institution. Verifying a blood bank with
// nobody to do that would create an institution that can never legally
// act, and the failure would surface much later as a confusing 403.
router.post('/institutions/:id/decision', async (req, res, next) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_FAILED',
      message: 'Decision must be VERIFIED or REJECTED.',
    });
  }

  try {
    const institution = await prisma.institution.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { staff: true } } },
    });

    if (!institution) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Institution not found.' });
    }

    if (parsed.data.decision === 'VERIFIED' && institution._count.staff === 0) {
      return res.status(409).json({
        error: 'NO_STAFF_ACCOUNT',
        message:
          'This blood bank has no staff account. Someone must be able to ' +
          'confirm thresholds and approve alerts before it can go live.',
      });
    }

    const updated = await prisma.institution.update({
      where: { id: institution.id },
      data: {
        verificationStatus: parsed.data.decision,
        verifiedByUserId: req.user.id,
        verifiedAt: new Date(),
      },
      include: { verifiedBy: { select: { name: true } }, _count: { select: { staff: true } } },
    });

    log.info(
      { institutionId: updated.id, decision: parsed.data.decision, userId: req.user.id },
      'Institution verification decision recorded'
    );

    return res.json({
      ...shape(updated),
      message:
        parsed.data.decision === 'VERIFIED'
          ? `${updated.name} can now report usage and raise requests.`
          : `${updated.name} has been rejected.`,
    });
  } catch (error) {
    return next(error);
  }
});

// GET /api/admin/stats
//
// Real counts. The mock this replaces returned invented figures
// (1250 users, 96.4% fulfilment) that looked like evidence the platform
// was working.
router.get('/stats', async (req, res, next) => {
  try {
    const [
      institutionsTotal,
      institutionsVerified,
      institutionsPending,
      donorsTotal,
      donorsPendingReview,
      staffTotal,
      usageRecords,
      requestsTotal,
      requestsAwaitingApproval,
      thresholdsConfirmed,
    ] = await Promise.all([
      prisma.institution.count(),
      prisma.institution.count({ where: { verificationStatus: 'VERIFIED' } }),
      prisma.institution.count({ where: { verificationStatus: 'UNVERIFIED' } }),
      prisma.donor.count(),
      prisma.donor.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.user.count({ where: { role: 'BLOOD_BANK_STAFF' } }),
      prisma.usageRecord.count(),
      prisma.request.count(),
      prisma.request.count({ where: { state: 'DETECTED' } }),
      prisma.bloodGroupThreshold.count({ where: { confirmedThreshold: { not: null } } }),
    ]);

    return res.json({
      institutions: {
        total: institutionsTotal,
        verified: institutionsVerified,
        awaitingReview: institutionsPending,
      },
      donors: { total: donorsTotal, awaitingReview: donorsPendingReview },
      staffAccounts: staffTotal,
      usageRecords,
      requests: { total: requestsTotal, awaitingApproval: requestsAwaitingApproval },
      thresholdsConfirmed,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
