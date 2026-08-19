// Effective stock.
//
// There are two things that know about stock, and they disagree by
// design:
//
//   1. The daily usage report. Staff count the shelf and type the
//      number in. That is ground truth AT THE MOMENT IT WAS COUNTED.
//
//   2. Donations released after that count. Real units, really on the
//      shelf, that the last count could not have included.
//
// Effective stock is (1) + (2). Neither alone is right: using only the
// report means a blood bank that collected 30 units this morning still
// reads as in breach, and would raise an alert asking donors for blood
// it already has. Using only donations means ignoring the one number a
// human actually verified.
//
// Deliberately NOT modelled: issuance between reports. Units leave the
// shelf continuously and nothing tells us in real time, so effective
// stock is an upper bound between counts. That is the safe direction to
// be wrong in for a supply floor - it never invents stock that is not
// there, it only credits stock we know arrived.

import { BLOOD_GROUPS } from '@rednexus/types';

/**
 * Latest reported stock per blood group, with the date it was reported.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export const getLastReportedStock = async (prisma, institutionId) => {
  const rows = await prisma.usageRecord.findMany({
    where: { institutionId },
    orderBy: { date: 'desc' },
    distinct: ['bloodGroup'],
    select: { bloodGroup: true, stockOnHand: true, date: true, createdAt: true },
  });
  return new Map(rows.map((r) => [r.bloodGroup, r]));
};

/**
 * Units released to the shelf after each group was last counted.
 *
 * Keyed on the VERIFIED blood group. A donation cannot be shelved
 * against a group the donor merely claimed - which is the practical
 * reason blood_group_self_reported and blood_group_verified are
 * separate columns rather than one (Rules section 2).
 */
export const getReleasedSinceReport = async (prisma, institutionId, lastReported) => {
  const released = await prisma.donationRecord.findMany({
    where: {
      institutionId,
      screeningStatus: 'RELEASED',
      releasedAt: { not: null },
      bloodGroupVerified: { not: null },
    },
    select: { bloodGroupVerified: true, releasedAt: true, unitsContributed: true },
  });

  const totals = new Map(BLOOD_GROUPS.map((g) => [g, 0]));

  for (const d of released) {
    const report = lastReported.get(d.bloodGroupVerified);

    // Count it only if it was released AFTER the moment the count was
    // true. Anything earlier is already inside the counted number, and
    // adding it again would double-count.
    //
    // That moment is not simply end-of-report-day. Two cases:
    //
    //   same-day report - staff counted the shelf and submitted at,
    //     say, 09:00. A unit released at 14:00 is genuinely not in that
    //     number, so the boundary is createdAt, not midnight.
    //
    //   backdated report - submitted today for last Tuesday. The number
    //     describes Tuesday's shelf, so the boundary is end of Tuesday,
    //     not today. Using createdAt here would wrongly discard
    //     everything released in between.
    //
    // min(createdAt, end of report date) is correct in both.
    if (report) {
      const endOfReportDay = new Date(report.date);
      endOfReportDay.setUTCHours(23, 59, 59, 999);
      const countedThrough =
        report.createdAt < endOfReportDay ? report.createdAt : endOfReportDay;
      if (d.releasedAt <= countedThrough) continue;
    }

    totals.set(d.bloodGroupVerified, totals.get(d.bloodGroupVerified) + d.unitsContributed);
  }

  return totals;
};

/**
 * Effective stock per blood group, with the components kept visible.
 *
 * The breakdown is returned rather than collapsed to one number so the
 * dashboard can say "45 counted on 19 Aug, plus 8 released since"
 * instead of an unexplained 53.
 */
export const getEffectiveStock = async (prisma, institutionId) => {
  const lastReported = await getLastReportedStock(prisma, institutionId);
  const releasedSince = await getReleasedSinceReport(prisma, institutionId, lastReported);

  const result = new Map();
  for (const group of BLOOD_GROUPS) {
    const report = lastReported.get(group);
    const counted = report ? report.stockOnHand : 0;
    const released = releasedSince.get(group) ?? 0;
    result.set(group, {
      bloodGroup: group,
      effective: counted + released,
      counted,
      countedOn: report ? report.date : null,
      releasedSince: released,
      everReported: Boolean(report),
    });
  }
  return result;
};

/**
 * Units awaiting screening. Not stock - it cannot be issued - but staff
 * need to see it, because "12 units arrive tomorrow" changes whether
 * today's breach is worth waking donors for.
 */
export const getPendingScreening = async (prisma, institutionId) => {
  const rows = await prisma.donationRecord.groupBy({
    by: ['bloodGroupVerified'],
    where: { institutionId, screeningStatus: 'PENDING_SCREENING' },
    _sum: { unitsContributed: true },
  });
  return new Map(
    rows
      .filter((r) => r.bloodGroupVerified)
      .map((r) => [r.bloodGroupVerified, r._sum.unitsContributed ?? 0])
  );
};

export default { getEffectiveStock, getLastReportedStock, getReleasedSinceReport, getPendingScreening };
