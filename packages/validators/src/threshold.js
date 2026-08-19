// Threshold confirmation schemas (T3).
//
// The gate itself. Rules section 1: no system-proposed threshold takes
// effect without an explicit confirming action from a named
// BLOOD_BANK_STAFF user at that institution. There is no auto-confirm
// mode, no bulk-approve shortcut, and no setting that disables it.
//
// Note what is absent: there is no "confirmAll" schema and no way to
// express "accept every proposal". Confirmation is per blood group, on
// purpose - PRD section 10 names rubber-stamping as a top-four risk,
// and one button that approves eight numbers at once is exactly how a
// gate becomes a formality.

import { z } from 'zod';
import { BLOOD_GROUPS } from '@rednexus/types';

export const thresholdConfirmSchema = z.object({
  // Staff may edit before confirming. The proposal is advice, not a
  // decision - if the number looks wrong to the person who actually
  // runs the blood bank, theirs wins.
  confirmedThreshold: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole units only')
    .min(0, 'Cannot be negative')
    .max(10000, 'That looks too high - please check'),

  confirmedCollectionTarget: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Whole units only')
    .min(0, 'Cannot be negative')
    .max(10000, 'That looks too high - please check'),
});

export const bloodGroupParamSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS, {
    errorMap: () => ({ message: 'Unknown blood group' }),
  }),
});

export const thresholdQuerySchema = z.object({
  // Trailing window for the rolling average. Long enough to smooth
  // day-to-day noise, short enough to stay responsive; worth tuning
  // once real pilot data exists (Phases.md, Phase 4).
  windowDays: z.coerce.number().int().min(7).max(90).default(28),
});
