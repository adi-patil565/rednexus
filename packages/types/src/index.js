// Shared domain constants.
//
// These mirror the enums in backend/prisma/schema.prisma exactly.
// If you change one, change both.

// ============================================================
// Blood groups
// ============================================================

// Wire/storage values (match the Prisma enum)
export const BLOOD_GROUPS = [
  'A_POS',
  'A_NEG',
  'B_POS',
  'B_NEG',
  'O_POS',
  'O_NEG',
  'AB_POS',
  'AB_NEG',
];

// Display labels. Never store these — store the wire value.
export const BLOOD_GROUP_LABELS = {
  A_POS: 'A+',
  A_NEG: 'A-',
  B_POS: 'B+',
  B_NEG: 'B-',
  O_POS: 'O+',
  O_NEG: 'O-',
  AB_POS: 'AB+',
  AB_NEG: 'AB-',
};

export const BLOOD_GROUP_FROM_LABEL = Object.fromEntries(
  Object.entries(BLOOD_GROUP_LABELS).map(([value, label]) => [label, value])
);

// ============================================================
// Donor
// ============================================================

export const DONOR_STATUS = {
  PROVISIONAL: 'PROVISIONAL',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACTIVE: 'ACTIVE',
  PERMANENTLY_DEFERRED: 'PERMANENTLY_DEFERRED',
};

export const GENDER = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  OTHER: 'OTHER',
};

export const DONATION_TYPE = {
  VOLUNTARY: 'VOLUNTARY',
  REPLACEMENT: 'REPLACEMENT',
};

export const DEFERRAL_TYPE = {
  TEMPORARY: 'TEMPORARY',
  PERMANENT: 'PERMANENT',
};

// Standard minimum interval between whole-blood donations, in days.
// A staff-set deferralUntilDate always takes precedence over these.
export const ELIGIBILITY_INTERVAL_DAYS = {
  MALE: 90,
  FEMALE: 120,
  OTHER: 120, // conservative default
};

export const MIN_DONOR_AGE = 18;
export const MAX_DONOR_AGE = 65;

// ============================================================
// Users and institutions
// ============================================================

export const USER_ROLE = {
  BLOOD_BANK_STAFF: 'BLOOD_BANK_STAFF',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
};

export const INSTITUTION_CATEGORY = {
  IN_HOUSE: 'IN_HOUSE',
  EXTERNAL: 'EXTERNAL',
};

export const VERIFICATION_STATUS = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
};

// ============================================================
// Requests (Phase 5) — declared now so nothing invents its own
// vocabulary in the meantime.
// ============================================================

export const REQUEST_ORIGIN = {
  SCHEDULED: 'SCHEDULED',
  THRESHOLD_BREACH: 'THRESHOLD_BREACH',
  MANUAL: 'MANUAL',
};

// The full state machine. DETECTED is skipped only for MANUAL origin,
// where a human already initiated the request.
export const REQUEST_STATE = {
  DETECTED: 'DETECTED',
  RAISED: 'RAISED',
  NOTIFIED: 'NOTIFIED',
  ACCEPTED: 'ACCEPTED',
  CONFIRMED: 'CONFIRMED',
  ARRIVED: 'ARRIVED',
  DONATED: 'DONATED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
};

// Legal transitions. The request service is the only code allowed to
// move state, and it validates against this table (Rules section 2).
export const REQUEST_TRANSITIONS = {
  DETECTED: ['RAISED', 'CANCELLED'],
  RAISED: ['NOTIFIED', 'CANCELLED'],
  NOTIFIED: ['NOTIFIED', 'ACCEPTED', 'CANCELLED'], // self-loop = escalation stage
  ACCEPTED: ['CONFIRMED', 'NOTIFIED', 'CANCELLED'],
  CONFIRMED: ['ARRIVED', 'NOTIFIED', 'CANCELLED'],
  ARRIVED: ['DONATED', 'CANCELLED'],
  DONATED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export const NOTIFICATION_CHANNEL = {
  PUSH: 'PUSH',
  SMS: 'SMS',
  IVR: 'IVR',
  EMAIL: 'EMAIL',
};
