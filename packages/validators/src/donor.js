// Donor registration schema (F1).
//
// Field selection is derived from the D Y Patil Hospital Blood Centre
// donor questionnaire (DYPHRC/BC/MER/FM/01V_3.0), filtered to the
// fields that change how the system behaves.
//
// Deliberately NOT collected here — these stay on paper, answered in
// person at the blood centre at the time of donation:
//   Q2       day-of checks (feeling well, last meal, heavy work after)
//   Q3       the 25-condition disease list
//   Q4-Q9    transfusion, surgery, typhoid, rabies, tattoo, jaundice,
//            hepatitis, malaria, dengue, vaccination, medication
//   Q10-Q11  HIV / TTI risk and sexual history
//   Q12      pregnancy, breastfeeding, menstruation
//   page 4   weight, pulse, BP, temperature, physical examination
//
// Three reasons, any one of which is sufficient:
//   1. Legal    — Q10-12 is the most sensitive category the DPDP Act
//                 recognises. Collecting it in an app creates breach
//                 liability with no product benefit.
//   2. Temporal — Q2/Q6/Q7/Q8 are time-windowed ("today", "last 3
//                 months"). An answer captured at QR registration is
//                 stale, and therefore wrong, by donation day.
//   3. Authority— the form itself says "If yes, discuss with the doctor
//                 present." It already routes these to a human.

import { z } from 'zod';
import {
  BLOOD_GROUPS,
  MIN_DONOR_AGE,
  MAX_DONOR_AGE,
} from '@rednexus/types';

const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const PINCODE = /^\d{6}$/;

/** Whole years between a date and today. */
const ageInYears = (dob) => {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

export const donorRegistrationSchema = z
  .object({
    // --- Identity (form page 1) ---
    name: z.string().trim().min(2, 'Please enter your full name').max(120),

    gender: z.enum(['MALE', 'FEMALE', 'OTHER'], {
      errorMap: () => ({ message: 'Please select your gender' }),
    }),

    dateOfBirth: z.coerce
      .date({ errorMap: () => ({ message: 'Please enter your date of birth' }) })
      .refine((d) => d <= new Date(), 'Date of birth cannot be in the future')
      .refine(
        (d) => ageInYears(d) >= MIN_DONOR_AGE,
        `You must be at least ${MIN_DONOR_AGE} to register as a donor`
      )
      .refine(
        (d) => ageInYears(d) <= MAX_DONOR_AGE,
        `Donor registration is open up to age ${MAX_DONOR_AGE}`
      ),

    // Form collects Resi/Office/Mobile. Only mobile reaches a donor.
    phone: z
      .string()
      .trim()
      .regex(INDIAN_MOBILE, 'Enter a 10-digit mobile number starting with 6-9'),

    email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),

    // PIN code only. The paper form's full residential address is more
    // precision than matching needs (Rules section 4).
    areaPincode: z.string().trim().regex(PINCODE, 'Enter a 6-digit PIN code'),

    // The questionnaire never asks this — it is determined by testing.
    // A donor's answer is a claim, stored separately from the verified
    // value the blood centre later records.
    bloodGroupSelfReported: z.enum(BLOOD_GROUPS, {
      errorMap: () => ({ message: 'Please select your blood group' }),
    }),

    // --- Donation history (Q1) ---
    donatedBefore: z.boolean(),
    priorDonationCount: z.coerce.number().int().min(0).max(200).optional(), // Q1.1
    lastDonationDate: z.coerce
      .date()
      .refine((d) => d <= new Date(), 'Last donation date cannot be in the future')
      .optional(), // Q1.2

    // --- Donation type (form header) ---
    donationType: z.enum(['VOLUNTARY', 'REPLACEMENT']).default('VOLUNTARY'),
    patientName: z.string().trim().min(2).max(120).optional().or(z.literal('')),

    // --- Q1.5 ---
    // YES sends the record to PENDING_REVIEW. The app never asks why
    // and never interprets the answer.
    advisedNotToDonate: z.boolean(),

    // --- Consent, form page 3 (DPDP Act 2023) ---
    // Wording (a): "Blood donation is a voluntary act and no inducement
    // or remuneration has been offered."
    consentGiven: z
      .boolean()
      .refine((v) => v === true, 'Consent is required to register as a donor'),

    // Consent (e): a donor choice, not an assumption.
    notifyAbnormalResults: z.boolean().default(false),

    preferredChannel: z.enum(['PUSH', 'SMS', 'IVR', 'EMAIL']).default('SMS'),

    registeredAtCampId: z.string().trim().optional(),
  })
  // A replacement donation is donating on behalf of a named patient.
  .refine(
    (d) => d.donationType !== 'REPLACEMENT' || Boolean(d.patientName?.trim()),
    { message: 'Patient name is required for a replacement donation', path: ['patientName'] }
  )
  // If they have donated before, the date drives the eligibility clock.
  .refine((d) => !d.donatedBefore || Boolean(d.lastDonationDate), {
    message: 'Please enter the date of your last donation',
    path: ['lastDonationDate'],
  });

/**
 * Fields blood bank staff may change on an existing donor record.
 * Everything else is either donor-owned or system-controlled.
 */
export const donorStaffUpdateSchema = z.object({
  bloodGroupVerified: z.enum(BLOOD_GROUPS).optional(),

  // Form page 4, "Outcome". The accompanying free-text "Reasons for
  // Deferral" is intentionally absent — sensitive health data with no
  // system behaviour attached. It stays on the paper form.
  deferralType: z.enum(['TEMPORARY', 'PERMANENT']).optional(),
  deferralUntilDate: z.coerce.date().optional(),
});
