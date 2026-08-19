// Database fixtures.
//
// Rules section 1 is explicit that testing the human-in-the-loop gates
// must be done with seed data carrying a pre-confirmed BLOOD_BANK_STAFF
// account - never with an auto-confirm flag or a bypass. This file is
// that seed data.
//
// Institutions are migrated from firestore-seed/seed.js (10 real Navi
// Mumbai blood banks) with two deliberate changes:
//
//   1. The `Negatives` stock bucket is split into A-, B-, O- and AB-.
//      Per-blood-group thresholds are the entire product; O- cannot
//      have a threshold if O- has no column. It is also the group where
//      shortages hurt most, and the one the rare-group registry (N4)
//      depends on.
//
//   2. The plaintext institution passwords in that file are dropped.
//      Firebase Auth owns credentials; this database never stores one.
//
// Idempotent - safe to run repeatedly.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CONSENT_PURPOSE =
  'Contact for voluntary blood donation requests and eligibility reminders';

// Navi Mumbai blood banks. `dailyUsageUnits` is retained as a seed for
// generating plausible per-group usage history in the next stage - the
// single scalar cannot itself feed the threshold engine, which needs a
// daily series per blood group.
const INSTITUTIONS = [
  {
    slug: 'mgm_kamothe',
    name: 'MGM Hospital Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'MGM Hospital, Kamothe',
    address: 'Sector 1, Sion-Panvel Expressway, Kamothe, Navi Mumbai',
    pincode: '410209',
    dailyUsageUnits: 55,
    staff: { name: 'Anil Sharma', email: 'anil.sharma@mgmblood.dummy.in', phone: '9876500001' },
  },
  {
    slug: 'fortis_vashi',
    name: 'Fortis Hiranandani Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'Fortis Hiranandani Hospital, Vashi',
    address: 'Mini Sea Shore Road, Sector 10A, Vashi, Navi Mumbai',
    pincode: '400703',
    dailyUsageUnits: 40,
    staff: { name: 'Megha Patil', email: 'm.patil@fortisbb.dummy.in', phone: '9876500002' },
  },
  {
    slug: 'dypatil_nerul',
    name: 'D.Y. Patil Hospital Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'D.Y. Patil Hospital, Nerul',
    address: 'Sector 5, Nerul, Navi Mumbai',
    pincode: '400706',
    dailyUsageUnits: 65,
    staff: { name: 'Rajesh Iyer', email: 'rajesh.iyer@dypblood.dummy.in', phone: '9876500003' },
  },
  {
    slug: 'apollo_belapur',
    name: 'Apollo Hospitals Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'Apollo Hospitals, CBD Belapur',
    address: 'Plot 13, Parsik Hill Road, Sector 23, CBD Belapur, Navi Mumbai',
    pincode: '400614',
    dailyUsageUnits: 50,
    staff: { name: 'Sneha Deshmukh', email: 's.deshmukh@apollobb.dummy.in', phone: '9876500004' },
  },
  {
    // Municipal - serves multiple hospitals and walk-in requests.
    slug: 'nmmc_vashi',
    name: 'NMMC General Hospital Blood Bank',
    category: 'EXTERNAL',
    linkedHospitalName: null,
    address: 'Sector 10, Vashi, Navi Mumbai',
    pincode: '400703',
    dailyUsageUnits: 80,
    staff: { name: 'Prakash Kadam', email: 'p.kadam@nmmcbb.dummy.in', phone: '9876500005' },
  },
  {
    slug: 'reliance_kk',
    name: 'Reliance Hospital Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'Reliance Hospital, Koparkhairane',
    address: 'Thane-Belapur Road, Sector 10, Koparkhairane, Navi Mumbai',
    pincode: '400709',
    dailyUsageUnits: 35,
    staff: { name: 'Vivek Singh', email: 'vivek.singh@reliancebb.dummy.in', phone: '9876500006' },
  },
  {
    slug: 'terna_nerul',
    name: 'Terna Speciality Hospital Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'Terna Speciality Hospital, Nerul',
    address: 'Sector 12, Phase II, Nerul West, Navi Mumbai',
    pincode: '400706',
    dailyUsageUnits: 45,
    staff: { name: 'Anjali Joshi', email: 'a.joshi@ternabb.dummy.in', phone: '9876500007' },
  },
  {
    slug: 'suyash_seawoods',
    name: 'Suyash Hospital Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'Suyash Hospital, Seawoods',
    address: 'Sector 40, Seawoods West, Navi Mumbai',
    pincode: '400706',
    dailyUsageUnits: 20,
    staff: { name: 'Rohan Mehta', email: 'rohan.m@suyashbb.dummy.in', phone: '9876500008' },
  },
  {
    slug: 'pkc_vashi',
    name: 'PKC Hospital Blood Bank',
    category: 'IN_HOUSE',
    linkedHospitalName: 'PKC Hospital, Vashi',
    address: 'Sector 11, Juhu Nagar, Vashi, Navi Mumbai',
    pincode: '400703',
    dailyUsageUnits: 25,
    staff: { name: 'Kavita Nair', email: 'k.nair@pkcbb.dummy.in', phone: '9876500009' },
  },
  {
    // Municipal - serves multiple hospitals and walk-in requests.
    slug: 'pmc_panvel',
    name: 'Panvel Municipal Blood Bank',
    category: 'EXTERNAL',
    linkedHospitalName: null,
    address: 'Near Panvel ST Stand, Old Panvel, Navi Mumbai',
    pincode: '410206',
    dailyUsageUnits: 50,
    staff: { name: 'Sameer Gokhale', email: 's.gokhale@pmcbb.dummy.in', phone: '9876500010' },
  },
];

// A spread of donor states so every branch of the eligibility engine
// has a fixture: eligible, mid-interval, flagged for review, and
// deferred past their interval.
const daysAgo = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};
const daysAhead = (n) => daysAgo(-n);

const DONORS = [
  {
    slug: 'donor-eligible-opos',
    name: 'Amit Deshpande',
    gender: 'MALE',
    dateOfBirth: new Date('1992-04-12'),
    phone: '9820000001',
    areaPincode: '410209',
    bloodGroupSelfReported: 'O_POS',
    bloodGroupVerified: 'O_POS',
    donatedBefore: true,
    priorDonationCount: 4,
    lastDonationDate: daysAgo(120), // past the 90-day male interval
    status: 'ACTIVE',
  },
  {
    slug: 'donor-midinterval-bpos',
    name: 'Sunita Rane',
    gender: 'FEMALE',
    dateOfBirth: new Date('1988-11-30'),
    phone: '9820000002',
    areaPincode: '400703',
    bloodGroupSelfReported: 'B_POS',
    donatedBefore: true,
    priorDonationCount: 2,
    lastDonationDate: daysAgo(45), // inside the 120-day female interval
    status: 'ACTIVE',
  },
  {
    slug: 'donor-rare-oneg',
    name: 'Farhan Qureshi',
    gender: 'MALE',
    dateOfBirth: new Date('1995-07-08'),
    phone: '9820000003',
    areaPincode: '400706',
    bloodGroupSelfReported: 'O_NEG',
    bloodGroupVerified: 'O_NEG',
    donatedBefore: true,
    priorDonationCount: 7,
    lastDonationDate: daysAgo(200),
    status: 'ACTIVE',
  },
  {
    // Answered YES to "ever advised not to donate?" - held for a human.
    slug: 'donor-pending-review',
    name: 'Neha Kulkarni',
    gender: 'FEMALE',
    dateOfBirth: new Date('1999-02-17'),
    phone: '9820000004',
    areaPincode: '400614',
    bloodGroupSelfReported: 'AB_NEG',
    donatedBefore: false,
    advisedNotToDonateFlag: true,
    status: 'PENDING_REVIEW',
  },
  {
    // The eligibility edge case: interval elapsed, but staff deferred.
    slug: 'donor-deferred',
    name: 'Vikram Salunkhe',
    gender: 'MALE',
    dateOfBirth: new Date('1985-09-03'),
    phone: '9820000005',
    areaPincode: '400709',
    bloodGroupSelfReported: 'A_POS',
    donatedBefore: true,
    priorDonationCount: 11,
    lastDonationDate: daysAgo(180),
    deferralUntilDate: daysAhead(30),
    deferralType: 'TEMPORARY',
    status: 'ACTIVE',
  },
];

async function main() {
  console.log('Seeding...\n');

  // --- Platform admin ---------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: 'admin@raktasetu.dummy.in' },
    update: {},
    create: {
      firebaseUid: 'seed-platform-admin',
      name: 'Platform Admin',
      email: 'admin@raktasetu.dummy.in',
      phone: '9900000000',
      role: 'PLATFORM_ADMIN',
      // institutionId stays null - admins are platform-level.
    },
  });
  console.log(`  PLATFORM_ADMIN  ${admin.email}`);

  // --- Institutions and their staff --------------------------------
  let verifiedCount = 0;

  for (const inst of INSTITUTIONS) {
    // The first institution is VERIFIED so there is always a working
    // fixture for testing threshold confirmation and alert approval.
    // The rest stay UNVERIFIED, which is what makes the admin approval
    // flow testable - and proves verification is not being bypassed.
    const isVerified = inst.slug === 'mgm_kamothe';

    const institution = await prisma.institution.upsert({
      where: { id: inst.slug },
      update: {},
      create: {
        id: inst.slug,
        name: inst.name,
        category: inst.category,
        linkedHospitalName: inst.linkedHospitalName,
        address: inst.address,
        pincode: inst.pincode,
        verificationStatus: isVerified ? 'VERIFIED' : 'UNVERIFIED',
        verifiedByUserId: isVerified ? admin.id : null,
        verifiedAt: isVerified ? new Date() : null,
      },
    });

    // Rules section 3: a blood bank cannot go live without at least one
    // BLOOD_BANK_STAFF account. Every institution gets one here so that
    // constraint is always satisfiable in tests.
    await prisma.user.upsert({
      where: { email: inst.staff.email },
      update: {},
      create: {
        firebaseUid: `seed-staff-${inst.slug}`,
        name: inst.staff.name,
        email: inst.staff.email,
        phone: inst.staff.phone,
        role: 'BLOOD_BANK_STAFF',
        institutionId: institution.id,
      },
    });

    if (isVerified) verifiedCount += 1;
    console.log(
      `  ${isVerified ? 'VERIFIED  ' : 'UNVERIFIED'}      ${inst.name} (${inst.category})`
    );
  }

  // --- Donors -------------------------------------------------------
  for (const d of DONORS) {
    const { slug, ...fields } = d;
    await prisma.donor.upsert({
      where: { id: slug },
      update: {},
      create: {
        id: slug,
        ...fields,
        donationType: 'VOLUNTARY',
        consentAt: new Date(),
        consentPurpose: CONSENT_PURPOSE,
        preferredChannel: 'SMS',
      },
    });
    console.log(`  DONOR           ${d.bloodGroupSelfReported.padEnd(7)} ${d.status}`);
  }

  console.log(
    `\nDone. ${INSTITUTIONS.length} institutions (${verifiedCount} verified), ` +
      `${INSTITUTIONS.length + 1} users, ${DONORS.length} donors.`
  );
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
