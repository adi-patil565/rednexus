// Eligibility engine tests (F2).
//
// Rules section 6: "Eligibility calculation logic must have tests -
// this is a correctness-critical, easy-to-get-wrong date calculation."
//
// The case that matters most is the deferral override: a donor whose
// standard 90/120-day interval has already elapsed but who carries a
// staff-set deferralUntilDate in the future must still read as
// INELIGIBLE. Getting that backwards would notify people a doctor has
// told not to donate.

import { describe, it, expect } from 'vitest';
import {
  computeEligibility,
  eligibilityMessage,
  intervalDaysFor,
  INELIGIBLE_REASON,
} from '../services/eligibility.service.js';

const TODAY = new Date('2026-08-19T00:00:00Z');

/** Date N days before TODAY. */
const daysAgo = (n) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

/** Date N days after TODAY. */
const daysAhead = (n) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

const donor = (overrides = {}) => ({
  gender: 'MALE',
  status: 'ACTIVE',
  lastDonationDate: null,
  deferralUntilDate: null,
  deferralType: null,
  ...overrides,
});

describe('intervalDaysFor', () => {
  it('is 90 days for male donors', () => {
    expect(intervalDaysFor('MALE')).toBe(90);
  });

  it('is 120 days for female donors', () => {
    expect(intervalDaysFor('FEMALE')).toBe(120);
  });

  it('falls back to the conservative 120 for OTHER', () => {
    expect(intervalDaysFor('OTHER')).toBe(120);
  });

  it('falls back to 120 for an unrecognised value rather than 0', () => {
    // A missing interval must never read as "eligible immediately".
    expect(intervalDaysFor(undefined)).toBe(120);
  });
});

describe('standard interval', () => {
  it('a donor who has never donated is eligible', () => {
    const result = computeEligibility(donor(), TODAY);
    expect(result.eligible).toBe(true);
    expect(result.eligibleFrom).toBeNull();
  });

  it('male donor at 89 days is NOT eligible', () => {
    const result = computeEligibility(donor({ lastDonationDate: daysAgo(89) }), TODAY);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(INELIGIBLE_REASON.INTERVAL_NOT_ELAPSED);
  });

  it('male donor at exactly 90 days IS eligible — boundary is inclusive', () => {
    const result = computeEligibility(donor({ lastDonationDate: daysAgo(90) }), TODAY);
    expect(result.eligible).toBe(true);
  });

  it('male donor at 91 days is eligible', () => {
    expect(computeEligibility(donor({ lastDonationDate: daysAgo(91) }), TODAY).eligible).toBe(true);
  });

  it('female donor at 90 days is NOT yet eligible — 120-day interval', () => {
    const result = computeEligibility(
      donor({ gender: 'FEMALE', lastDonationDate: daysAgo(90) }),
      TODAY
    );
    expect(result.eligible).toBe(false);
  });

  it('female donor at exactly 120 days IS eligible', () => {
    const result = computeEligibility(
      donor({ gender: 'FEMALE', lastDonationDate: daysAgo(120) }),
      TODAY
    );
    expect(result.eligible).toBe(true);
  });

  it('ignores time of day — donation earlier the same clock-day still counts', () => {
    const ninetyDaysAgoLate = new Date(daysAgo(90));
    ninetyDaysAgoLate.setUTCHours(23, 59, 0, 0);
    const result = computeEligibility(donor({ lastDonationDate: ninetyDaysAgoLate }), TODAY);
    expect(result.eligible).toBe(true);
  });
});

describe('deferral override', () => {
  it('★ future deferral beats an ALREADY-ELAPSED interval', () => {
    // 200 days since donating - well past the 90-day male interval -
    // but staff deferred them until 30 days from now.
    const result = computeEligibility(
      donor({ lastDonationDate: daysAgo(200), deferralUntilDate: daysAhead(30) }),
      TODAY
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(INELIGIBLE_REASON.TEMPORARILY_DEFERRED);
    expect(result.eligibleFrom).toEqual(daysAhead(30));
  });

  it('a past deferral no longer applies', () => {
    const result = computeEligibility(
      donor({ lastDonationDate: daysAgo(200), deferralUntilDate: daysAgo(10) }),
      TODAY
    );
    expect(result.eligible).toBe(true);
  });

  it('a deferral expiring today makes the donor eligible today', () => {
    const result = computeEligibility(
      donor({ lastDonationDate: daysAgo(200), deferralUntilDate: TODAY }),
      TODAY
    );
    expect(result.eligible).toBe(true);
  });

  it('reports the LATER of deferral end and interval end', () => {
    // Deferral lifts in 10 days, but the interval has 30 days to run.
    const result = computeEligibility(
      donor({ lastDonationDate: daysAgo(60), deferralUntilDate: daysAhead(10) }),
      TODAY
    );
    expect(result.eligible).toBe(false);
    expect(result.eligibleFrom).toEqual(daysAhead(30));
  });

  it('permanent deferral never lapses, however long ago they donated', () => {
    const result = computeEligibility(
      donor({ lastDonationDate: daysAgo(9999), deferralType: 'PERMANENT' }),
      TODAY
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(INELIGIBLE_REASON.PERMANENTLY_DEFERRED);
    expect(result.eligibleFrom).toBeNull();
  });

  it('PERMANENTLY_DEFERRED status alone blocks eligibility', () => {
    const result = computeEligibility(donor({ status: 'PERMANENTLY_DEFERRED' }), TODAY);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(INELIGIBLE_REASON.PERMANENTLY_DEFERRED);
  });
});

describe('PENDING_REVIEW', () => {
  it('is never eligible, even having never donated', () => {
    const result = computeEligibility(donor({ status: 'PENDING_REVIEW' }), TODAY);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(INELIGIBLE_REASON.PENDING_REVIEW);
  });

  it('outranks an elapsed interval', () => {
    const result = computeEligibility(
      donor({ status: 'PENDING_REVIEW', lastDonationDate: daysAgo(500) }),
      TODAY
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe(INELIGIBLE_REASON.PENDING_REVIEW);
  });
});

describe('donor-facing wording (Rules section 7)', () => {
  it('states plainly when someone can donate', () => {
    expect(eligibilityMessage(computeEligibility(donor(), TODAY), TODAY)).toBe(
      'You can donate now.'
    );
  });

  it('gives a date and a day count, with no jargon', () => {
    const e = computeEligibility(donor({ lastDonationDate: daysAgo(60) }), TODAY);
    const msg = eligibilityMessage(e, TODAY);
    expect(msg).toContain('You can donate again from');
    expect(msg).toContain('30 days');
    expect(msg).not.toMatch(/eligib|interval|deferral/i);
  });

  it('never reveals a medical reason for a review hold', () => {
    const e = computeEligibility(donor({ status: 'PENDING_REVIEW' }), TODAY);
    const msg = eligibilityMessage(e, TODAY);
    expect(msg).toBe('Your registration is being checked by blood bank staff.');
    expect(msg).not.toMatch(/medical|advised|doctor|reason/i);
  });
});
