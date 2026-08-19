// Application logger.
//
// Rules section 4: no PII in application logs. Log donor and institution
// IDs only - never names, phone numbers, emails, or addresses.
//
// Redaction is configured here, centrally, rather than trusting every
// call site to remember. A log line that accidentally includes a donor's
// phone number is a DPDP Act problem, and "we'll be careful" is not a
// control.

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

// Paths scrubbed before anything is written. The `*.` wildcard form
// catches one level of nesting, which covers req.body.phone,
// donor.phone, user.email and similar.
const REDACT_PATHS = [
  'phone',
  'name',
  'email',
  'address',
  'password',
  'patientName',
  'token',
  'idToken',
  'authorization',
  '*.phone',
  '*.name',
  '*.email',
  '*.address',
  '*.password',
  '*.patientName',
  '*.token',
  '*.idToken',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.phone',
  'req.body.name',
  'req.body.email',
  'req.body.password',
  'req.body.patientName',
  'req.body.dateOfBirth',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  redact: {
    paths: REDACT_PATHS,
    censor: '[redacted]',
  },
  // Human-readable in dev; structured JSON in production.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }),
});

/**
 * Child logger for a subsystem, e.g. logger.child({ module: 'auth' }).
 * @param {string} name
 */
export const moduleLogger = (name) => logger.child({ module: name });

export default logger;
