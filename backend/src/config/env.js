// Validated environment configuration.
//
// Everything the backend reads from process.env passes through here, so
// a missing or malformed value fails at startup with a clear message
// rather than surfacing as a confusing error hours later.

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required. See .env.example.')
    .startsWith('postgresql://', 'DATABASE_URL must be a postgresql:// connection string'),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // The single origin allowed to call this API in production. Required
  // there and ignored in development, where localhost ports move around
  // and the risk is nil.
  WEB_ORIGIN: z.string().url().optional(),

  // Path to the Firebase service account JSON. Optional at startup:
  // the server still boots without it so the health check and
  // unauthenticated routes work, but every authenticated route returns
  // 503 until it is present. See config/firebaseAdmin.js.
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // ML service. Rules section 5: unreachable must degrade to
  // rule-based logic, never surface as an error.
  ML_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  ML_SERVICE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  ROLLING_AVERAGE_WINDOW_DAYS: z.coerce.number().int().min(7).max(90).default(28),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
});

const parsed = envSchema
  .refine(
    (e) => e.NODE_ENV !== 'production' || Boolean(e.WEB_ORIGIN),
    {
      message:
        'WEB_ORIGIN is required in production - without it CORS would ' +
        'fall back to allowing every origin.',
      path: ['WEB_ORIGIN'],
    }
  )
  .safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.errors
    .map((e) => `  ${e.path.join('.')}: ${e.message}`)
    .join('\n');

  // Printed rather than logged: the logger itself depends on env.
  console.error(
    `\nInvalid environment configuration:\n${details}\n\n` +
      'Copy .env.example to backend/.env and fill in the missing values.\n'
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export default env;
