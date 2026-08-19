// Camp schemas (F10).

import { z } from 'zod';

const PINCODE = /^\d{6}$/;

export const campCreateSchema = z.object({
  title: z.string().trim().min(3, 'Give the camp a name').max(120),

  date: z.coerce
    .date({ errorMap: () => ({ message: 'Pick a date' }) })
    .refine((d) => {
      // Same-day is fine - camps get posted the morning of. Yesterday
      // is not, because nobody can attend it.
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return d >= today;
    }, 'That date has already passed'),

  // Free text rather than a time picker. "9 AM to 4 PM" and "after
  // morning rounds" are both things blood banks actually write, and a
  // picker would force worse data, not better.
  timeNote: z.string().trim().max(80).optional().or(z.literal('')),

  location: z.string().trim().min(3, 'Where is it?').max(200),
  pincode: z.string().trim().regex(PINCODE, 'Enter a 6-digit PIN code'),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export const campQuerySchema = z.object({
  // Donors see their own area by default; widening is explicit.
  pincode: z.string().trim().regex(PINCODE).optional(),
  days: z.coerce.number().int().min(1).max(180).default(60),
});
