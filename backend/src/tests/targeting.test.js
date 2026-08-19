// Targeting filter chain tests (F4).
//
// Rules section 6: "The notification targeting filter chain (blood
// group -> eligibility -> preference -> budget) must have tests
// confirming each filter stage actually excludes what it claims to."
//
// Each stage gets its own test with a donor that ONLY that stage would
// remove, so a filter quietly ceasing to exclude fails here rather than
// discovering itself in production by waking someone who asked not to
// be woken.

import { describe, it, expect } from 'vitest';
import {
  filterByBloodGroup,
  filterByEligibility,
  filterByPreference,
  filterByBudget,
  filterAlreadyNotified,
  scoreDonor,
  rankDonors,
  batchSizeFor,
  selectDonors,
  DEFAULT_MONTHLY_CAP,
} from '../services/targeting.service.js';

const TODAY = new Date('2026-08-20T00:00:00Z');
const daysAgo = (n) => {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};
const daysAhead = (n) => daysAgo(-n);

let seq = 0;
const donor = (o = {}) => ({
  id: `d${(seq += 1)}`,
  gender: 'MALE',
  status: 'ACTIVE',
  bloodGroupSelfReported: 'O_POS',
  bloodGroupVerified: null,
  areaPincode: '410209',
  lastDonationDate: daysAgo(200),
  deferralUntilDate: null,
  deferralType: null,
  notificationsPaused: false,
  priorDonationCount: 0,
  ...o,
});

describe('stage 1 — blood group', () => {
  it('excludes a different blood group', () => {
    const pool = [donor({ bloodGroupSelfReported: 'O_POS' }), donor({ bloodGroupSelfReported: 'A_NEG' })];
    expect(filterByBloodGroup(pool, 'O_POS')).toHaveLength(1);
  });

  it('★ prefers the verified group over the self-reported claim', () => {
    // Claims O+ but tested A-. Must not be targeted for an O+ request.
    const mistaken = donor({ bloodGroupSelfReported: 'O_POS', bloodGroupVerified: 'A_NEG' });
    expect(filterByBloodGroup([mistaken], 'O_POS')).toHaveLength(0);
    expect(filterByBloodGroup([mistaken], 'A_NEG')).toHaveLength(1);
  });
});

describe('stage 2 — eligibility', () => {
  it('excludes a donor inside their interval', () => {
    const tooSoon = donor({ lastDonationDate: daysAgo(30) });
    expect(filterByEligibility([tooSoon], TODAY)).toHaveLength(0);
  });

  it('★ excludes a deferred donor whose interval has already elapsed', () => {
    const deferred = donor({ lastDonationDate: daysAgo(300), deferralUntilDate: daysAhead(20) });
    expect(filterByEligibility([deferred], TODAY)).toHaveLength(0);
  });

  it('excludes a donor held for review', () => {
    expect(filterByEligibility([donor({ status: 'PENDING_REVIEW' })], TODAY)).toHaveLength(0);
  });

  it('excludes a permanently deferred donor', () => {
    expect(filterByEligibility([donor({ status: 'PERMANENTLY_DEFERRED' })], TODAY)).toHaveLength(0);
  });

  it('keeps an eligible donor', () => {
    expect(filterByEligibility([donor()], TODAY)).toHaveLength(1);
  });
});

describe('stage 3 — preference', () => {
  it('★ excludes a paused donor', () => {
    expect(filterByPreference([donor({ notificationsPaused: true })])).toHaveLength(0);
  });

  it('keeps a donor who has not paused', () => {
    expect(filterByPreference([donor()])).toHaveLength(1);
  });
});

describe('stage 4 — notification budget', () => {
  it('★ excludes a donor already at the monthly cap', () => {
    const d = donor();
    const sent = new Map([[d.id, DEFAULT_MONTHLY_CAP]]);
    expect(filterByBudget([d], sent)).toHaveLength(0);
  });

  it('keeps a donor below the cap', () => {
    const d = donor();
    expect(filterByBudget([d], new Map([[d.id, DEFAULT_MONTHLY_CAP - 1]]))).toHaveLength(1);
  });

  it('keeps a donor with no history this month', () => {
    expect(filterByBudget([donor()], new Map())).toHaveLength(1);
  });
});

describe('stage 5 — already notified for this request', () => {
  it('★ excludes someone contacted in an earlier escalation stage', () => {
    const d = donor();
    expect(filterAlreadyNotified([d], new Set([d.id]))).toHaveLength(0);
  });
});

describe('ranking', () => {
  it('ranks a local donor above a distant one', () => {
    const local = donor({ areaPincode: '410209' });
    const far = donor({ areaPincode: '999999' });
    expect(scoreDonor(local, '410209')).toBeGreaterThan(scoreDonor(far, '410209'));
  });

  it('★ ranks a verified blood group above a self-reported one', () => {
    // Rules section 2: ranking must account for the difference rather
    // than treating the two fields as interchangeable.
    const verified = donor({ bloodGroupVerified: 'O_POS' });
    const claimed = donor({ bloodGroupVerified: null });
    expect(scoreDonor(verified, '410209')).toBeGreaterThan(scoreDonor(claimed, '410209'));
  });

  it('ranks a repeat donor above a first-timer', () => {
    const repeat = donor({ priorDonationCount: 8 });
    const first = donor({ priorDonationCount: 0 });
    expect(scoreDonor(repeat, '410209')).toBeGreaterThan(scoreDonor(first, '410209'));
  });

  it('caps the repeat-donor bonus so history cannot dominate', () => {
    const many = donor({ priorDonationCount: 500, areaPincode: '999999' });
    const localFew = donor({ priorDonationCount: 1, areaPincode: '410209' });
    // 500 donations must not outweigh actually being nearby.
    expect(scoreDonor(localFew, '410209')).toBeGreaterThan(
      scoreDonor(many, '410209') - 40
    );
  });

  it('returns donors in descending score order', () => {
    const ranked = rankDonors(
      [donor({ areaPincode: '999999' }), donor({ areaPincode: '410209', bloodGroupVerified: 'O_POS' })],
      '410209'
    );
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});

describe('batch sizing', () => {
  it('over-asks modestly rather than blasting', () => {
    // PRD section 8 measures notifications per successful donation.
    expect(batchSizeFor(10, 1)).toBe(15);
  });

  it('has a floor for very small needs', () => {
    expect(batchSizeFor(1, 1)).toBe(3);
  });

  it('widens with each escalation stage', () => {
    expect(batchSizeFor(10, 2)).toBeGreaterThan(batchSizeFor(10, 1));
  });
});

describe('the full chain', () => {
  it('★ applies every stage and reports what each removed', () => {
    const wrongGroup = donor({ bloodGroupSelfReported: 'A_NEG' });
    const tooSoon = donor({ lastDonationDate: daysAgo(10) });
    const paused = donor({ notificationsPaused: true });
    const atCap = donor();
    const already = donor();
    const good = donor({ areaPincode: '410209', bloodGroupVerified: 'O_POS' });

    const { selected, funnel } = selectDonors({
      donors: [wrongGroup, tooSoon, paused, atCap, already, good],
      bloodGroup: 'O_POS',
      institutionPincode: '410209',
      sentThisMonth: new Map([[atCap.id, DEFAULT_MONTHLY_CAP]]),
      alreadyNotified: new Set([already.id]),
      unitsNeeded: 5,
      stage: 1,
      today: TODAY,
    });

    expect(funnel.total).toBe(6);
    expect(funnel.matchedBloodGroup).toBe(5); // wrong group gone
    expect(funnel.eligible).toBe(4); // too soon gone
    expect(funnel.afterPreferences).toBe(3); // paused gone
    expect(funnel.withinBudget).toBe(2); // at cap gone
    expect(funnel.notAlreadyNotified).toBe(1); // already notified gone

    expect(selected).toHaveLength(1);
    expect(selected[0].donor.id).toBe(good.id);
  });

  it('returns an empty selection rather than throwing when nobody qualifies', () => {
    const { selected, funnel } = selectDonors({
      donors: [donor({ notificationsPaused: true })],
      bloodGroup: 'O_POS',
      institutionPincode: '410209',
      sentThisMonth: new Map(),
      alreadyNotified: new Set(),
      unitsNeeded: 5,
      today: TODAY,
    });
    expect(selected).toHaveLength(0);
    expect(funnel.selected).toBe(0);
  });
});
