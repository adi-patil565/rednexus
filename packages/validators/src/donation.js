// Donation recording and screening release.

import { z } from 'zod';
import { BLOOD_GROUPS } from '@rednexus/types';

export const donationRecordSchema = z.object({
  donorId: z.string().min(1, 'Donor is required'),

  date: z.coerce
    .date()
    .optional()
    .refine((d) => !d || d <= new Date(), 'Donation date cannot be in the future'),

  // The group the blood centre determined by testing. Optional at
  // recording time - it may come back with the screening result - but
  // required before the unit can be released to stock, because you
  // cannot shelve blood against a group the donor merely claimed.
  bloodGroupVerified: z.enum(BLOOD_GROUPS).optional(),

  // Paper form page 4, "Hb Level". Feeds the F8 trend.
  hbValue: z.coerce.number().min(0).max(30).optional(),

  volumeMl: z.coerce.number().int().min(0).max(1000).optional(),

  unitsContributed: z.coerce.number().int().min(1).max(4).default(1),
});

export const donationReleaseSchema = z.object({
  // Required here even if it was set at recording time, so releasing is
  // an explicit statement about which group is going on the shelf.
  bloodGroupVerified: z.enum(BLOOD_GROUPS, {
    errorMap: () => ({ message: 'A verified blood group is required before release' }),
  }),
});

// Discard carries no reason field. Why a unit failed screening is a
// medical fact about a named donor, and Rules section 1 keeps the app
// out of interpreting those. The blood centre records it on paper.
export const donationDiscardSchema = z.object({});
