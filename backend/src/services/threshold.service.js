// Threshold engine (T2 / T4) — the core mechanism.
//
// Converts observed daily usage into two numbers per blood group:
//
//   T2  minimum stock threshold      "hold at least 18 units of O+"
//   T4  recurring collection target  "collect ~29 units of O+ per week"
//
// T4 is the one that matters most to the product's thesis. A threshold
// tells you when you are already in trouble; a collection target tells
// you what steady rate keeps you out of it. Converting episodic,
// drive-only collection into a steady rate IS the product (PRD
// section 3), and the threshold alert is the safety net beneath it.
//
// This is the rule-based implementation and it ships first. Rules
// section 2: the fallback must be a complete, working path on its own,
// never dependent on the ML service. Prophet/SARIMA (F6, Phase 9)
// replaces the mean below with a forecast; everything else stays.

import { BLOOD_GROUPS } from '@rednexus/types';

// Days between deciding more blood is needed and having usable units:
// contact donors, they arrive, donate, then mandatory TTI screening
// before release. Three days is deliberately conservative.
export const REPLENISHMENT_LEAD_DAYS = 3;

// Safety factor on demand variability. 1.65 is the standard normal
// quantile for a 95% service level - i.e. stock covers demand through
// the lead time in about 19 of every 20 periods.
export const SERVICE_LEVEL_Z = 1.65;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Sample standard deviation (n-1), which is the right one for a sample. */
const stdDev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Confidence in a proposal, from how much of the window was reported.
 *
 * Never blocks. PRD section 10 is explicit that thin data must not stop
 * a threshold being proposed - it must be surfaced instead, so staff
 * can weigh the number rather than trust it blindly.
 */
export const confidenceFor = (daysOfData, windowDays) => {
  const coverage = windowDays === 0 ? 0 : daysOfData / windowDays;
  if (daysOfData < 7 || coverage < 0.3) return 'LOW';
  if (daysOfData < 14 || coverage < 0.6) return 'MEDIUM';
  return 'HIGH';
};

/**
 * Compute a proposal for one blood group from its daily issuance series.
 *
 * Reorder-point model:
 *   threshold = (mean daily x lead days) + (z x sigma x sqrt(lead days))
 *
 * The first term covers expected demand while replacement blood is
 * being collected. The second is a buffer for demand being lumpier than
 * average - sqrt(lead days) because variance accumulates over
 * independent days, not linearly.
 *
 * @param {number[]} dailyUnits one entry per REPORTED day
 * @param {number} windowDays size of the window those days came from
 */
export const computeProposal = (dailyUnits, windowDays) => {
  const m = mean(dailyUnits);
  const sd = stdDev(dailyUnits);

  const expectedDemand = m * REPLENISHMENT_LEAD_DAYS;
  const safetyBuffer = SERVICE_LEVEL_Z * sd * Math.sqrt(REPLENISHMENT_LEAD_DAYS);

  // A group with real demand should never propose a zero threshold -
  // that would mean "no alert until you are completely out".
  const threshold = Math.max(m > 0 ? 1 : 0, Math.ceil(expectedDemand + safetyBuffer));

  // T4: in steady state, collection must match consumption. Anything
  // less and the drive-to-drive decline the product exists to fix
  // simply continues.
  //
  // No wastage/expiry uplift is applied. Blood does expire, but
  // inventing a percentage without data would be false precision - it
  // is a refinement for real pilot data, not a guess to bake in now.
  const weeklyTarget = Math.ceil(m * 7);

  const confidence = confidenceFor(dailyUnits.length, windowDays);

  const basis =
    `${dailyUnits.length} of the last ${windowDays} days reported. ` +
    `Average ${m.toFixed(1)} units/day (varies by ${sd.toFixed(1)}). ` +
    `Threshold covers ${REPLENISHMENT_LEAD_DAYS} days of use ` +
    `(${expectedDemand.toFixed(1)}) plus a buffer for busier days ` +
    `(${safetyBuffer.toFixed(1)}).`;

  return {
    proposedThreshold: threshold,
    proposedCollectionTarget: weeklyTarget,
    meanDailyUsage: Number(m.toFixed(2)),
    stdDevDailyUsage: Number(sd.toFixed(2)),
    daysOfData: dailyUnits.length,
    windowDays,
    confidence,
    computationBasis: basis,
  };
};

/**
 * Build proposals for every blood group at one institution.
 *
 * Groups with no reported usage still get a proposal (all zeros) so the
 * confirmation screen shows all eight rows. A group that genuinely
 * never moves should be visibly zero, not silently absent.
 *
 * @param {Array<{bloodGroup: string, date: Date, unitsIssued: number}>} records
 */
export const proposeForInstitution = (records, windowDays) => {
  const series = new Map(BLOOD_GROUPS.map((g) => [g, []]));

  for (const r of records) {
    if (series.has(r.bloodGroup)) series.get(r.bloodGroup).push(r.unitsIssued);
  }

  return BLOOD_GROUPS.map((bloodGroup) => ({
    bloodGroup,
    ...computeProposal(series.get(bloodGroup), windowDays),
  }));
};

/**
 * Is a blood group currently in breach of its CONFIRMED threshold?
 *
 * Reads confirmedThreshold and never proposedThreshold. A proposal is
 * not a decision - Rules section 1 - so an unconfirmed threshold can
 * never trigger anything. Returns null when nothing is confirmed yet,
 * which callers must treat as "no opinion", not "no breach".
 */
export const checkBreach = (threshold, currentStock) => {
  if (!threshold || threshold.confirmedThreshold == null) return null;
  return {
    bloodGroup: threshold.bloodGroup,
    currentStock,
    confirmedThreshold: threshold.confirmedThreshold,
    inBreach: currentStock <= threshold.confirmedThreshold,
    shortfall: Math.max(0, threshold.confirmedThreshold - currentStock),
  };
};

export default { computeProposal, proposeForInstitution, checkBreach, confidenceFor };
