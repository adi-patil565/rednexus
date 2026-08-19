// Request routes (T5, F4, F5, F7).
//
// The confirmation gate lives at POST /:id/confirm. Note there is no
// bulk variant and no query parameter that confirms everything -
// Rules section 1 calls this "not configurable", and an endpoint that
// took an array of ids would be exactly the shortcut it forbids.

import { Router } from 'express';
import { z } from 'zod';
import { BLOOD_GROUP_LABELS, BLOOD_GROUPS } from '@rednexus/types';
import { prisma } from '../config/prisma.js';
import { verifyFirebaseToken } from '../middleware/authMiddleware.js';
import { verifiedStaff, loadUser } from '../middleware/loadUser.js';
import { notifyLimiter } from '../middleware/rateLimits.js';
import {
  detectBreaches,
  confirmRequest,
  dispatch,
  transitionTo,
  respond,
} from '../services/request.service.js';
import { STATE } from '../lib/stateMachine.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('request-routes');
const router = Router();

const manualRequestSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS),
  unitsNeeded: z.coerce.number().int().min(1).max(500),
  urgent: z.boolean().default(false),
  reason: z.string().trim().min(3).max(300),
});

const confirmSchema = z.object({
  unitsNeeded: z.coerce.number().int().min(1).max(500).optional(),
  urgent: z.boolean().optional(),
});

const transitionSchema = z.object({
  to: z.enum([STATE.ARRIVED, STATE.DONATED, STATE.CLOSED, STATE.CANCELLED, STATE.CONFIRMED]),
});

const badRequest = (res, error) =>
  res.status(400).json({
    error: 'VALIDATION_FAILED',
    fields: error.errors.reduce((acc, e) => {
      acc[e.path.join('.')] = e.message;
      return acc;
    }, {}),
  });

const shape = (r) => ({
  id: r.id,
  bloodGroup: BLOOD_GROUP_LABELS[r.bloodGroup],
  bloodGroupValue: r.bloodGroup,
  unitsNeeded: r.unitsNeeded,
  urgent: r.urgent,
  origin: r.origin,
  state: r.state,
  basis: r.detectionBasis,
  stockAtDetection: r.stockAtDetection,
  thresholdAtDetection: r.thresholdAtDetection,
  stageLevel: r.stageLevel,
  confirmedBy: r.confirmedBy ? r.confirmedBy.name : null,
  confirmedAt: r.confirmedAt,
  createdAt: r.createdAt,
  awaitingConfirmation: r.state === STATE.DETECTED,
});

// ============================================================
// Donor-facing. Mounted BEFORE the staff guard, because the caller is
// a donor, not staff.
// ============================================================

// POST /api/requests/:id/respond
router.post('/:id/respond', verifyFirebaseToken, async (req, res, next) => {
  const parsed = z.object({ accept: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const donor = await prisma.donor.findUnique({ where: { firebaseUid: req.firebaseUid } });
    if (!donor) {
      return res.status(403).json({ error: 'NOT_A_DONOR', message: 'No donor record for this account.' });
    }

    const result = await respond(prisma, req.params.id, donor.id, parsed.data.accept);

    return res.json({
      accepted: parsed.data.accept,
      requestState: result.state,
      message: parsed.data.accept
        ? 'Thank you. The blood bank will contact you about when to come in.'
        : 'Thank you for letting us know.',
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: 'CONFLICT', message: error.message });
    return next(error);
  }
});

// ============================================================
// Staff-facing.
// ============================================================

router.use(verifyFirebaseToken, ...verifiedStaff);

// GET /api/requests?state=DETECTED
router.get('/', async (req, res, next) => {
  try {
    const where = { institutionId: req.user.institutionId };
    if (req.query.state) where.state = req.query.state;

    const requests = await prisma.request.findMany({
      where,
      orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }],
      include: {
        confirmedBy: { select: { name: true } },
        _count: { select: { notifications: true } },
      },
    });

    const accepted = await prisma.notificationLog.groupBy({
      by: ['requestId'],
      where: { requestId: { in: requests.map((r) => r.id) }, response: 'ACCEPTED' },
      _count: { _all: true },
    });
    const acceptedBy = new Map(accepted.map((a) => [a.requestId, a._count._all]));

    return res.json({
      requests: requests.map((r) => ({
        ...shape(r),
        notified: r._count.notifications,
        accepted: acceptedBy.get(r.id) ?? 0,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/requests/detect — run T5 breach detection now.
//
// Creates DETECTED drafts only. This endpoint cannot notify anyone;
// the scheduled BullMQ version in Phase 6 will not either.
router.post('/detect', async (req, res, next) => {
  try {
    const drafted = await detectBreaches(prisma, req.user.institutionId);
    return res.json({
      drafted: drafted.length,
      requests: drafted.map(shape),
      message:
        drafted.length === 0
          ? 'No blood groups are below their confirmed threshold.'
          : `${drafted.length} draft alerts created. None have been sent — each needs your approval.`,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/requests — raise a request directly (origin MANUAL).
//
// Enters at RAISED, skipping DETECTED, because a human initiated it.
// That is not a bypass of the gate: the human IS the gate.
router.post('/', async (req, res, next) => {
  const parsed = manualRequestSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const request = await prisma.request.create({
      data: {
        institutionId: req.user.institutionId,
        bloodGroup: parsed.data.bloodGroup,
        unitsNeeded: parsed.data.unitsNeeded,
        urgent: parsed.data.urgent,
        origin: 'MANUAL',
        state: STATE.RAISED,
        detectionBasis: `Raised by staff: ${parsed.data.reason}`,
        confirmedByUserId: req.user.id,
        confirmedAt: new Date(),
      },
    });

    log.info(
      { requestId: request.id, institutionId: req.user.institutionId, userId: req.user.id },
      'Manual request raised'
    );

    return res.status(201).json(shape(request));
  } catch (error) {
    return next(error);
  }
});

// POST /api/requests/:id/confirm — THE GATE. One request, one user.
router.post('/:id/confirm', async (req, res, next) => {
  const parsed = confirmSchema.safeParse(req.body ?? {});
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const updated = await confirmRequest(prisma, req.params.id, req.user, parsed.data);
    return res.json({
      ...shape(updated),
      message: 'Approved. You can now notify donors.',
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.code ?? 'CONFLICT', message: error.message });
    }
    return next(error);
  }
});

// POST /api/requests/:id/notify — dispatch the next batch (F4 / F5).
router.post('/:id/notify', notifyLimiter, async (req, res, next) => {
  try {
    const request = await prisma.request.findUnique({ where: { id: req.params.id } });
    if (!request || request.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Request not found.' });
    }

    const result = await dispatch(prisma, req.params.id);
    return res.json({
      ...result,
      message:
        result.notified === 0
          ? 'No donors matched. Widen the request or raise it manually.'
          : `${result.notified} donors contacted.`,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.code ?? 'CONFLICT', message: error.message });
    }
    return next(error);
  }
});

// GET /api/requests/:id — detail, including who was contacted.
//
// F7: donor contact details are exposed ONLY here, to the verified
// institution that raised this request, and only for donors who
// accepted it. Everyone else is an id and a status.
router.get('/:id', async (req, res, next) => {
  try {
    const request = await prisma.request.findUnique({
      where: { id: req.params.id },
      include: {
        confirmedBy: { select: { name: true } },
        notifications: {
          include: {
            donor: {
              select: {
                id: true,
                name: true,
                phone: true,
                areaPincode: true,
                bloodGroupVerified: true,
                bloodGroupSelfReported: true,
              },
            },
          },
          orderBy: { rankScore: 'desc' },
        },
      },
    });

    if (!request || request.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Request not found.' });
    }

    return res.json({
      ...shape(request),
      donors: request.notifications.map((n) => {
        const base = {
          donorId: n.donor.id,
          areaPincode: n.donor.areaPincode,
          channel: n.channel,
          stage: n.stage,
          sentAt: n.sentAt,
          response: n.response,
          respondedAt: n.respondedAt,
        };
        // Contact details only for donors who said yes to THIS request.
        return n.response === 'ACCEPTED'
          ? { ...base, name: n.donor.name, phone: n.donor.phone }
          : base;
      }),
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/requests/:id/transition — explicit state moves.
//
// Every move is validated against the state machine table. There is no
// endpoint anywhere that writes Request.state directly.
router.post('/:id/transition', async (req, res, next) => {
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  try {
    const request = await prisma.request.findUnique({ where: { id: req.params.id } });
    if (!request || request.institutionId !== req.user.institutionId) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Request not found.' });
    }

    const extra = {};
    if (parsed.data.to === STATE.CLOSED) extra.closedAt = new Date();
    if (parsed.data.to === STATE.CANCELLED) extra.cancelledAt = new Date();

    const updated = await transitionTo(prisma, req.params.id, parsed.data.to, extra);
    return res.json(shape(updated));
  } catch (error) {
    if (error.code === 'ILLEGAL_TRANSITION') {
      return res.status(409).json({ error: error.code, message: error.message });
    }
    if (error.status) {
      return res.status(error.status).json({ error: 'CONFLICT', message: error.message });
    }
    return next(error);
  }
});

export default router;
