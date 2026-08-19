// Eligibility engine (F2).
//
// Rules section 2: "Eligibility is a computed field, not a stored or
// scheduled timer." There is no eligibility column and no per-donor
// timer job - it is derived on every read from data we already hold.
//
// Everything here is a pure function of (donor, today). No database, no
// clock reads inside the logic. That is what makes the date arithmetic
// - which Rules section 6 calls out as correctness-critical and easy to
// get wrong - actually testable at its edges.

import {
  ELIGIBILITY_INTERVAL_DAYS,
  DONOR_STATUS,
  DEFERRAL_TYPE,
} from '@rednexus/types';

/** Reasons a donor is not currently eligible. */
export const INELIGIBLE_REASON = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  PERMANENTLY_DEFERRED: 'PERMANENTLY_DEFERRED',
  TEMPORARILY_DEFERRED: 'TEMPORARILY_DEFERRED',
  INTERVAL_NOT_ELAPSED: 'INTERVAL_NOT_ELAPSED',
};

/** Midnight UTC for a date, so comparisons ignore time of day. */
const startOfDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, days) => {
  const d = startOfDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const daysBetween = (from, to) =>
  Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);

/**
 * Minimum days between donations for a donor.
 * 90 male / 120 female. OTHER uses the conservative 120.
 */
export const intervalDaysFor = (gender) =>
  ELIGIBILITY_INTERVAL_DAYS[gender] ?? ELIGIBILITY_INTERVAL_DAYS.OTHER;

/**
 * The date a donor becomes eligible from their donation interval alone,
 * ignoring any deferral. Null if they have never donated.
 */
export const intervalEligibleFrom = (donor) => {
  if (!donor.lastDonationDate) return null;
  return addDays(donor.lastDonationDate, intervalDaysFor(donor.gender));
};

/**
 * Compute a donor's current eligibility.
 *
 * Precedence, highest first:
 *   1. PENDING_REVIEW      - awaiting human clearance, never targetable
 *   2. Permanent deferral  - page 4 Outcome "Permanent deferral"
 *   3. Temporary deferral  - deferralUntilDate, if still in the future.
 *                            ALWAYS beats the standard interval, even
 *                            when the interval has already elapsed.
 *   4. Standard interval   - lastDonationDate + 90/120 days
 *   5. Never donated       - eligible
 *
 * @param {object} donor
 * @param {Date} [today]
 * @returns {{eligible: boolean, reason: string|null, eligibleFrom: Date|null}}
 */
export const computeEligibility = (donor, today = new Date()) => {
  const now = startOfDay(today);

  // 1. Held for staff review. The app never interprets the medical
  // reason behind "advised not to donate" - it routes to a human.
  if (donor.status === DONOR_STATUS.PENDING_REVIEW) {
    return { eligible: false, reason: INELIGIBLE_REASON.PENDING_REVIEW, eligibleFrom: null };
  }

  // 2. Permanent deferral never lapses.
  if (
    donor.status === DONOR_STATUS.PERMANENTLY_DEFERRED ||
    donor.deferralType === DEFERRAL_TYPE.PERMANENT
  ) {
    return {
      eligible: false,
      reason: INELIGIBLE_REASON.PERMANENTLY_DEFERRED,
      eligibleFrom: null,
    };
  }

  const intervalFrom = intervalEligibleFrom(donor);

  // 3. A staff-set deferral outranks the interval calculation. This is
  // the case that must hold even when the 90/120 days have passed.
  if (donor.deferralUntilDate) {
    const deferredUntil = startOfDay(donor.deferralUntilDate);
    if (deferredUntil > now) {
      return {
        eligible: false,
        reason: INELIGIBLE_REASON.TEMPORARILY_DEFERRED,
        // Whichever restriction lifts later is the real date.
        eligibleFrom:
          intervalFrom && intervalFrom > deferredUntil ? intervalFrom : deferredUntil,
      };
    }
  }

  // 5. Never donated - nothing to wait for.
  if (!intervalFrom) {
    return { eligible: true, reason: null, eligibleFrom: null };
  }

  // 4. Standard interval. Eligible ON the boundary day, not after it.
  if (intervalFrom <= now) {
    return { eligible: true, reason: null, eligibleFrom: null };
  }

  return {
    eligible: false,
    reason: INELIGIBLE_REASON.INTERVAL_NOT_ELAPSED,
    eligibleFrom: intervalFrom,
  };
};

/**
 * Donor-facing wording. Rules section 7: plain language, no jargon.
 * "eligibility window" becomes "you can donate again from [date]".
 */
export const eligibilityMessage = (eligibility, today = new Date()) => {
  if (eligibility.eligible) return 'You can donate now.';

  switch (eligibility.reason) {
    case INELIGIBLE_REASON.PENDING_REVIEW:
      // Deliberately vague: the app must not restate a medical reason.
      return 'Your registration is being checked by blood bank staff.';
    case INELIGIBLE_REASON.PERMANENTLY_DEFERRED:
      return 'Blood bank staff have advised that you should not donate.';
    default: {
      const days = daysBetween(today, eligibility.eligibleFrom);
      const when = eligibility.eligibleFrom.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      if (days <= 0) return 'You can donate now.';
      if (days === 1) return `You can donate again from tomorrow, ${when}.`;
      return `You can donate again from ${when}, in ${days} days.`;
    }
  }
};

export default { computeEligibility, eligibilityMessage, intervalEligibleFrom, intervalDaysFor };
