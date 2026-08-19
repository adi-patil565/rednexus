// Usage reporting schemas (T1).
//
// The blood bank reports units issued and stock on hand, per blood
// group, once a day. This is the platform's primary data feed - the
// rolling average, the threshold (T2) and the collection target (T4)
// are all derived from it.
//
// The whole form is submitted in one request rather than one request
// per blood group, because the entry screen has to stay under a minute
// (PRD section 10). Eight round trips would not.

import { z } from 'zod';
import { BLOOD_GROUPS } from '@rednexus/types';

/** A single blood group's numbers for one day. */
export const usageLineSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS),

  unitsIssued: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole units only')
    .min(0, 'Cannot be negative')
    .max(1000, 'That looks too high — please check'),

  stockOnHand: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole units only')
    .min(0, 'Cannot be negative')
    .max(10000, 'That looks too high — please check'),

  prbcUnits: z.coerce.number().int().min(0).max(10000).optional(),
  ffpUnits: z.coerce.number().int().min(0).max(10000).optional(),
  plateletUnits: z.coerce.number().int().min(0).max(10000).optional(),
});

export const usageReportSchema = z
  .object({
    // Defaults to today. Backdating is allowed so a missed day can be
    // filled in - PRD section 10 says never block on missing data.
    date: z.coerce
      .date()
      .optional()
      .refine((d) => !d || d <= new Date(), 'Cannot report usage for a future date'),

    entries: z
      .array(usageLineSchema)
      .min(1, 'Report at least one blood group')
      .max(BLOOD_GROUPS.length, 'Too many entries'),
  })
  .refine(
    (r) => new Set(r.entries.map((e) => e.bloodGroup)).size === r.entries.length,
    { message: 'Each blood group may appear only once', path: ['entries'] }
  );

export const usageQuerySchema = z.object({
  // The entry screen shows the last 7 days below the form so a typo
  // from yesterday is easy to spot.
  days: z.coerce.number().int().min(1).max(365).default(7),
});
