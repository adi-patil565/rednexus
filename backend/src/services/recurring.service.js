// Recurring patient scheduling (N1).
//
// A thalassemia patient needs blood every three weeks. That date is
// known months ahead, which makes this the one case in the platform
// where donors can be arranged BEFORE anyone is short of anything.
// Everything else here reacts to consumption; this anticipates a date.
//
// The mechanism deliberately reuses the ordinary request pipeline
// rather than inventing a parallel one. A schedule drafts a DETECTED
// request `leadDays` before the transfusion, a staff member confirms
// it, and from there it is the same targeting, the same escalation,
// the same budget. A predictable need is still a need a human approves
// (Rules section 1) - knowing about it in advance does not change that.

import { STATE } from '../lib/stateMachine.js';
import { BLOOD_GROUP_LABELS } from '@rednexus/types';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('recurring');

/** Days between transfusions, by frequency. */
export const FREQUENCY_DAYS = {
  WEEKLY: 7,
  FORTNIGHTLY: 14,
  MONTHLY: 30,
  EVERY_SIX_WEEKS: 42,
};

const startOfDay = (d) => {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

export const addDays = (date, days) => {
  const d = startOfDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

/** The transfusion after this one. */
export const advanceDueDate = (schedule) =>
  addDays(schedule.nextDueDate, FREQUENCY_DAYS[schedule.frequency]);

/**
 * Is it time to start arranging donors for this schedule?
 *
 * True inside the lead window and not before. Arranging three weeks
 * ahead sounds prudent and is not: donors agree, forget, and are
 * unreachable on the day, which is worse than not having asked.
 */
export const isDueForArrangement = (schedule, today = new Date()) => {
  if (!schedule.active) return false;
  const windowOpens = addDays(schedule.nextDueDate, -schedule.leadDays);
  return startOfDay(today) >= windowOpens;
};

export const daysUntilDue = (schedule, today = new Date()) =>
  Math.round((startOfDay(schedule.nextDueDate) - startOfDay(today)) / 86_400_000);

/**
 * Draft requests for every schedule entering its lead window.
 *
 * Creates DETECTED rows and notifies nobody, exactly like threshold
 * breach detection. The two feed the same gate.
 */
export const draftUpcomingTransfusions = async (prisma, institutionId, today = new Date()) => {
  const schedules = await prisma.recurringSchedule.findMany({
    where: { institutionId, active: true },
  });

  const drafted = [];

  for (const schedule of schedules) {
    if (!isDueForArrangement(schedule, today)) continue;

    // One open request per schedule. Re-running must not stack a second
    // ask for the same transfusion.
    const existing = await prisma.request.findFirst({
      where: {
        recurringScheduleId: schedule.id,
        state: { notIn: [STATE.CLOSED, STATE.CANCELLED] },
      },
    });
    if (existing) continue;

    const days = daysUntilDue(schedule, today);
    const label = BLOOD_GROUP_LABELS[schedule.bloodGroup];

    const request = await prisma.request.create({
      data: {
        institutionId,
        recurringScheduleId: schedule.id,
        bloodGroup: schedule.bloodGroup,
        unitsNeeded: schedule.unitsPerVisit,
        origin: 'SCHEDULED',
        state: STATE.DETECTED,
        // Names the patient reference, never a patient. Staff recognise
        // their own file numbers; the platform holds nothing more.
        detectionBasis:
          `Patient ${schedule.patientRef} is due a transfusion in ${days} ` +
          `${days === 1 ? 'day' : 'days'} and needs ${schedule.unitsPerVisit} ` +
          `${schedule.unitsPerVisit === 1 ? 'unit' : 'units'} of ${label}. ` +
          `This is a regular transfusion, so there is time to arrange donors.`,
      },
    });

    log.info(
      { requestId: request.id, scheduleId: schedule.id, institutionId, daysUntilDue: days },
      'Recurring transfusion drafted, awaiting staff confirmation'
    );
    drafted.push(request);
  }

  return drafted;
};

/**
 * Record that a transfusion happened and roll the schedule forward.
 *
 * Advances from the DUE date rather than from today, so a transfusion
 * given two days late does not permanently shift the cycle - the
 * patient's rhythm is clinical, not administrative.
 */
export const completeTransfusion = async (prisma, scheduleId) => {
  const schedule = await prisma.recurringSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw Object.assign(new Error('Schedule not found'), { status: 404 });

  const next = advanceDueDate(schedule);

  const updated = await prisma.recurringSchedule.update({
    where: { id: scheduleId },
    data: { nextDueDate: next },
  });

  log.info({ scheduleId, nextDueDate: next }, 'Transfusion recorded; schedule advanced');
  return updated;
};

/**
 * Is the donor pool for this transfusion on track?
 *
 * PRD N1 asks for early escalation while time remains. Reporting
 * shortfall with days-remaining attached is what makes that judgement
 * possible - "two short" means something different at six days out than
 * at one.
 */
export const coverageFor = async (prisma, schedule, today = new Date()) => {
  const request = await prisma.request.findFirst({
    where: {
      recurringScheduleId: schedule.id,
      state: { notIn: [STATE.CLOSED, STATE.CANCELLED] },
    },
  });

  if (!request) {
    return { arranged: false, accepted: 0, needed: schedule.unitsPerVisit, daysRemaining: daysUntilDue(schedule, today) };
  }

  const accepted = await prisma.notificationLog.count({
    where: { requestId: request.id, response: 'ACCEPTED' },
  });

  const daysRemaining = daysUntilDue(schedule, today);

  return {
    arranged: true,
    requestId: request.id,
    requestState: request.state,
    accepted,
    needed: request.unitsNeeded,
    covered: accepted >= request.unitsNeeded,
    daysRemaining,
    // Running out of days with an incomplete pool is the situation this
    // whole feature exists to catch early.
    atRisk: accepted < request.unitsNeeded && daysRemaining <= 2,
  };
};

export default {
  FREQUENCY_DAYS,
  advanceDueDate,
  isDueForArrangement,
  daysUntilDue,
  draftUpcomingTransfusions,
  completeTransfusion,
  coverageFor,
};
