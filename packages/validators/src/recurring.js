// Recurring transfusion schedules (N1).

import { z } from 'zod';
import { BLOOD_GROUPS } from '@rednexus/types';

export const scheduleCreateSchema = z.object({
  // An opaque reference the blood bank already uses - a hospital file
  // number. Deliberately NOT a name, an age, or a diagnosis: a donor
  // must never be able to reach a patient, and the cleanest guarantee
  // is that the platform does not know who the patient is.
  patientRef: z
    .string()
    .trim()
    .min(2, 'Enter the patient file number or reference')
    .max(60),

  bloodGroup: z.enum(BLOOD_GROUPS, {
    errorMap: () => ({ message: 'Select a blood group' }),
  }),

  unitsPerVisit: z.coerce.number().int().min(1).max(10).default(1),

  frequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'EVERY_SIX_WEEKS'], {
    errorMap: () => ({ message: 'How often does this patient need blood?' }),
  }),

  nextDueDate: z.coerce
    .date({ errorMap: () => ({ message: 'When is the next transfusion?' }) })
    .refine((d) => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return d >= today;
    }, 'That date has already passed'),

  // PRD N1 says 5-7 days: long enough to escalate twice if the first
  // batch is thin, short enough that donors still remember agreeing.
  leadDays: z.coerce.number().int().min(3).max(21).default(7),
});

export const scheduleUpdateSchema = z.object({
  unitsPerVisit: z.coerce.number().int().min(1).max(10).optional(),
  frequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'EVERY_SIX_WEEKS']).optional(),
  nextDueDate: z.coerce.date().optional(),
  leadDays: z.coerce.number().int().min(3).max(21).optional(),
  active: z.boolean().optional(),
});
