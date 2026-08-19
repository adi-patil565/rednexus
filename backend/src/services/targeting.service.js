// Donor targeting (F4) — the filter chain and rule-based ranking.
//
// Rules section 6: "The notification targeting filter chain (blood
// group -> eligibility -> preference -> budget) must have tests
// confirming each filter stage actually excludes what it claims to."
//
// Each stage is therefore a separate exported function over a plain
// array, rather than one large query. Slower, and worth it: a filter
// that silently stops excluding is a filter that starts waking donors
// who asked not to be woken, and that is the failure mode this whole
// product is built to avoid.
//
// This is the RULE-BASED path. Rules section 2 requires it to ship
// first and to remain a complete working path forever - the F6
// response-scoring model replaces rankDonors and nothing else.

import { computeEligibility } from './eligibility.service.js';

// F3 default until the full preference profile lands in Phase 6.
export const DEFAULT_MONTHLY_CAP = 2;

/**
 * Stage 1 — blood group.
 *
 * Matches the VERIFIED group when the blood centre has one, otherwise
 * the donor's own claim. Kept explicit because the two are not
 * interchangeable: a verified match is a fact, a self-reported match is
 * a hypothesis, and ranking below treats them differently.
 */
export const filterByBloodGroup = (donors, bloodGroup) =>
  donors.filter((d) => (d.bloodGroupVerified ?? d.bloodGroupSelfReported) === bloodGroup);

/**
 * Stage 2 — eligibility.
 *
 * Reuses the same computeEligibility as every other read. A donor
 * PENDING_REVIEW, permanently deferred, temporarily deferred, or inside
 * their interval is excluded here.
 */
export const filterByEligibility = (donors, today = new Date()) =>
  donors.filter((d) => computeEligibility(d, today).eligible);

/**
 * Stage 3 — donor preference.
 *
 * Pause mode is absolute: a paused donor is never contacted, however
 * urgent the request. That is the point of offering it.
 */
export const filterByPreference = (donors) =>
  donors.filter((d) => !d.notificationsPaused);

/**
 * Stage 4 — notification budget.
 *
 * Enforced HERE, inside the engine, before dispatch - not scattered
 * across application code (Rules section 2).
 *
 * @param {Map<string, number>} sentThisMonth donorId -> count
 */
export const filterByBudget = (donors, sentThisMonth, cap = DEFAULT_MONTHLY_CAP) =>
  donors.filter((d) => (sentThisMonth.get(d.id) ?? 0) < cap);

/**
 * Stage 5 — already notified for THIS request.
 *
 * Escalation widens the pool; it must never re-notify someone who was
 * already asked. Being messaged twice about the same need is exactly
 * the fatigue that makes donors opt out.
 */
export const filterAlreadyNotified = (donors, notifiedDonorIds) =>
  donors.filter((d) => !notifiedDonorIds.has(d.id));

/**
 * Rule-based ranking. Higher scores are contacted first.
 *
 * Deliberately simple and inspectable. Every component is something a
 * blood bank employee would recognise as a reason to call one person
 * before another.
 */
export const scoreDonor = (donor, institutionPincode, today = new Date()) => {
  let score = 0;

  // Same PIN code is a strong signal: the donor can actually get there.
  // Real distance ranking arrives with PostGIS; pincode equality is a
  // deliberate placeholder, not a permanent answer.
  if (donor.areaPincode === institutionPincode) score += 40;

  // A verified group is a tested fact; a self-reported one is a claim
  // that may not survive testing. Rules section 2 requires ranking to
  // account for the difference rather than treating them as equal.
  if (donor.bloodGroupVerified) score += 25;

  // Repeat donors respond more often. Capped so a very long history
  // cannot dominate every other consideration.
  score += Math.min(donor.priorDonationCount ?? 0, 10) * 2;

  // Longer past their eligibility date means a longer rest, and less
  // chance of being asked twice in quick succession.
  if (donor.lastDonationDate) {
    const days = Math.floor((today - new Date(donor.lastDonationDate)) / 86_400_000);
    score += Math.min(Math.max(days - 90, 0) / 30, 10);
  } else {
    // Never donated: real willingness is unknown, so a small nudge
    // rather than a large one.
    score += 5;
  }

  return Number(score.toFixed(3));
};

export const rankDonors = (donors, institutionPincode, today = new Date()) =>
  donors
    .map((d) => ({ donor: d, score: scoreDonor(d, institutionPincode, today) }))
    .sort((a, b) => b.score - a.score);

/**
 * How many donors to contact for a given need.
 *
 * Over-ask a little, because not everyone responds - but only a little.
 * PRD section 8 measures "notifications sent per successful donation",
 * and blasting the whole pool is precisely what this product exists to
 * replace.
 */
export const batchSizeFor = (unitsNeeded, stage) => {
  const base = Math.ceil(unitsNeeded * 1.5);
  return Math.max(3, base * Math.max(1, stage));
};

/**
 * The full chain, in order, reporting what each stage removed.
 *
 * The breakdown is returned rather than discarded so staff can be told
 * "18 matched, 11 eligible, 9 after preferences" instead of an
 * unexplained "9 donors" - and so a filter that silently stops
 * excluding is visible rather than invisible.
 */
export const selectDonors = ({
  donors,
  bloodGroup,
  institutionPincode,
  sentThisMonth,
  alreadyNotified,
  unitsNeeded,
  stage = 1,
  cap = DEFAULT_MONTHLY_CAP,
  today = new Date(),
}) => {
  const matched = filterByBloodGroup(donors, bloodGroup);
  const eligible = filterByEligibility(matched, today);
  const willing = filterByPreference(eligible);
  const withinBudget = filterByBudget(willing, sentThisMonth, cap);
  const fresh = filterAlreadyNotified(withinBudget, alreadyNotified);

  const ranked = rankDonors(fresh, institutionPincode, today);
  const take = batchSizeFor(unitsNeeded, stage);

  return {
    selected: ranked.slice(0, take),
    funnel: {
      total: donors.length,
      matchedBloodGroup: matched.length,
      eligible: eligible.length,
      afterPreferences: willing.length,
      withinBudget: withinBudget.length,
      notAlreadyNotified: fresh.length,
      selected: Math.min(take, ranked.length),
    },
  };
};

export default { selectDonors, rankDonors, scoreDonor, batchSizeFor };
