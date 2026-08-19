import { z } from 'zod';

export const donorRegistrationSchema = z.object({
  name: z.string().min(2),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  city: z.string().min(2),
});
