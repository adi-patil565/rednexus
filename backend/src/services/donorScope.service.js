// Which donors does an institution have any business with?
//
// Donors are a platform-wide pool by design — F4 targeting searches all
// of them, and it should. But "any verified staff account may act on
// any donor" is a different claim, and it was the mistake behind two
// separate holes:
//
//   - staff at any blood bank could permanently defer any donor, with
//     no way to undo it
//   - staff at any blood bank could pull names and phone numbers for
//     any PIN code, which is bulk harvesting of the one asset this
//     platform exists to protect
//
// F7 draws the line precisely: contact details go to a verified
// institution "only in the context of a request they raised". This
// module is that context, made explicit.
//
// A donor is in an institution's scope if they have actually
// interacted with it — donated there, been contacted for one of its
// requests, or registered at one of its camps. Everything else is a
// stranger, and a stranger's phone number is not the institution's to
// read.

/**
 * A Prisma `where` fragment matching donors this institution has a
 * genuine relationship with.
 *
 * Donor.registeredAtCampId is a plain string rather than a relation (a
 * camp can be deleted without orphaning the donor record), so the camp
 * ids are fetched first rather than joined.
 */
export const buildDonorScope = async (prisma, institutionId) => {
  const camps = await prisma.camp.findMany({
    where: { institutionId },
    select: { id: true },
  });
  const campIds = camps.map((c) => c.id);

  return {
    OR: [
      // Donated here.
      { donations: { some: { institutionId } } },
      // Was contacted about one of this institution's requests.
      { notifications: { some: { request: { institutionId } } } },
      // Said they would come to one of its camps.
      { campAttendances: { some: { camp: { institutionId } } } },
      // Registered by scanning the QR on one of its camp banners.
      ...(campIds.length ? [{ registeredAtCampId: { in: campIds } }] : []),
    ],
  };
};

/**
 * Is this specific donor in scope for this institution?
 *
 * Used by the mutating routes. Returns the donor when in scope and null
 * otherwise, so callers cannot accidentally proceed with a truthy
 * value.
 */
export const findDonorInScope = async (prisma, institutionId, donorId) => {
  const scope = await buildDonorScope(prisma, institutionId);
  return prisma.donor.findFirst({ where: { id: donorId, AND: [scope] } });
};

export default { buildDonorScope, findDonorInScope };
