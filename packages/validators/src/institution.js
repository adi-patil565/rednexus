// Institution application (Phase 3).

import { z } from 'zod';

const PINCODE = /^\d{6}$/;
const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export const institutionApplySchema = z
  .object({
    // --- The institution ---
    name: z.string().trim().min(3, 'Enter the blood bank name').max(160),

    category: z.enum(['IN_HOUSE', 'EXTERNAL'], {
      errorMap: () => ({ message: 'Is this inside a hospital or standalone?' }),
    }),

    // Display context only, and only for IN_HOUSE. Architecture.md is
    // explicit that this is not a separate login or reporting role -
    // there is one institution type, and the hospital is context.
    linkedHospitalName: z.string().trim().max(160).optional().or(z.literal('')),

    pincode: z.string().trim().regex(PINCODE, 'Enter a 6-digit PIN code'),
    address: z.string().trim().max(300).optional().or(z.literal('')),

    // --- The person applying ---
    // They become the first BLOOD_BANK_STAFF account. Verification
    // cannot complete without one, so collecting it here means an
    // application is never stuck in a state an admin cannot approve.
    contactName: z.string().trim().min(2, 'Who should we contact?').max(120),
    contactEmail: z.string().trim().email('Enter a valid email address'),
    contactPhone: z
      .string()
      .trim()
      .regex(INDIAN_MOBILE, 'Enter a 10-digit mobile number starting with 6-9'),
  })
  .refine(
    (d) => d.category !== 'IN_HOUSE' || Boolean(d.linkedHospitalName?.trim()),
    {
      message: 'Which hospital is this blood bank inside?',
      path: ['linkedHospitalName'],
    }
  );
