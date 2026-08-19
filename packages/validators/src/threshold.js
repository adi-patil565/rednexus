import { z } from 'zod';

export const thresholdSchema = z.object({
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']),
  minUnits: z.number().int().min(0),
  alertRadius: z.number().min(1).max(100),
});
