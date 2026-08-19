// Rate limits.
//
// Sized around the harm each route enables rather than a uniform
// number. The donor pool is the asset worth protecting here: names and
// phone numbers of people doing a favour, whose willingness to keep
// doing it is the entire product.
//
// Every limiter is deliberately generous for a human and hostile to a
// script. A blood bank clerk never searches twenty times a minute; a
// harvester does nothing else.

import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('ratelimit');

const onLimit = (name) => (req, res, next, options) => {
  // Log the route and the identity if we have one - never the IP,
  // which is personal data under the DPDP Act.
  log.warn({ limiter: name, path: req.path, userId: req.user?.id ?? null }, 'Rate limit hit');
  res.status(options.statusCode).json({
    error: 'RATE_LIMITED',
    message: 'Too many requests. Please wait a moment and try again.',
  });
};

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Skipped in tests. The suite drives hundreds of requests from one
  // address in seconds, which is exactly what these limits exist to
  // stop - leaving them on would mean the tests measure the limiter
  // rather than the behaviour underneath it. The limits themselves are
  // asserted separately in rateLimits.test.js.
  skip: () => isTest,
};

/** Broad ceiling. Generous - it exists to stop runaway loops. */
export const globalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 200,
  handler: onLimit('global'),
});

/**
 * Public donor registration.
 *
 * Unauthenticated and writes a row, so it is the obvious way to fill
 * the database with junk. Ten an hour per address still covers a
 * family registering together on one camp wifi.
 */
export const registrationLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 10,
  handler: onLimit('registration'),
});

/**
 * Donor search.
 *
 * The anti-enumeration limit. Even with results scoped and contact
 * details removed, a search endpoint is a search endpoint - twenty a
 * minute is more than any human needs and far less than a crawl.
 */
export const searchLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 20,
  handler: onLimit('search'),
});

/** Institution applications. Three an hour is already suspicious. */
export const applicationLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 3,
  handler: onLimit('application'),
});

/**
 * Donor notification dispatch.
 *
 * Not a scraping defence - a fatigue one. Each call messages real
 * people, and a stuck retry loop would burn the donor pool's goodwill
 * far faster than it would burn the server.
 */
export const notifyLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 10,
  handler: onLimit('notify'),
});

export default {
  globalLimiter,
  registrationLimiter,
  searchLimiter,
  applicationLimiter,
  notifyLimiter,
};
