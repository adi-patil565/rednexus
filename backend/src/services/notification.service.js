// Notification delivery (F5) — the channel chain.
//
// Rules section 2: "Notification channels are sequential, not parallel.
// Push -> wait -> SMS -> wait -> IVR. Never fire all channels for the
// same alert simultaneously."
//
// The reason is donor fatigue, not cost. Three messages arriving at once
// about one request reads as spam from an organisation the donor is
// doing a favour for, and the people who opt out after that are exactly
// the people the platform needs.
//
// TRANSPORT IS NOT WIRED. There is no FCM key and no SMS gateway, so
// `deliver` records the attempt and the donor sees the alert in the app
// (which genuinely works end to end). Everything that decides WHO gets
// contacted, on WHICH channel, in WHAT order, and HOW OFTEN is real -
// only the last inch is a stub, and it is one function.
//
// Swapping in a real gateway means implementing TRANSPORTS.SMS and
// nothing else.

import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('notify');

/**
 * How long to wait before escalating to the next channel for the same
 * donor. Short enough that an urgent request still moves; long enough
 * that a donor at work is not chased within minutes.
 */
export const CHANNEL_WAIT_MINUTES = { PUSH: 45, SMS: 90 };

/** The chain, in order. IVR is last because a phone call is the most intrusive. */
export const CHANNEL_CHAIN = ['PUSH', 'SMS', 'IVR'];

/**
 * The next channel to try after this one, or null when the chain is
 * exhausted. A donor who has not answered after all three has answered.
 */
export const nextChannel = (current) => {
  const i = CHANNEL_CHAIN.indexOf(current);
  return i === -1 || i === CHANNEL_CHAIN.length - 1 ? null : CHANNEL_CHAIN[i + 1];
};

/**
 * Where a donor's chain starts.
 *
 * A donor who asked for SMS should not be pushed at first and SMSed
 * second - their stated preference is the FIRST attempt, and escalation
 * continues from there. Honouring a preference by trying something else
 * first is not honouring it.
 */
export const startingChannel = (preferred) =>
  CHANNEL_CHAIN.includes(preferred) ? preferred : 'SMS';

// Transport stubs. Each returns { delivered, detail }.
const TRANSPORTS = {
  // In-app: the alert is already visible on the donor's home screen the
  // moment NotificationLog is written, so this genuinely delivers.
  PUSH: async () => ({ delivered: true, detail: 'in-app' }),

  // Needs a gateway (Twilio, MSG91, Gupshup). PRD N5 wants alerts to
  // work on feature phones, which makes this the one that matters most
  // for a real pilot.
  SMS: async () => ({ delivered: false, detail: 'no gateway configured' }),

  IVR: async () => ({ delivered: false, detail: 'no gateway configured' }),
};

/**
 * Attempt one channel for one donor.
 *
 * Never throws. Rules section 5: a delivery failure must not surface as
 * an error to the institution that raised the request - they did
 * nothing wrong, and a red error box helps nobody. Failures are logged
 * and the chain moves on.
 */
export const deliver = async ({ channel, donorId, requestId }) => {
  const transport = TRANSPORTS[channel];
  if (!transport) {
    log.warn({ channel, donorId, requestId }, 'Unknown channel');
    return { delivered: false, detail: 'unknown channel' };
  }

  try {
    const result = await transport();
    // Rules section 4: donor IDs only. Never a name or a phone number,
    // even in a delivery log - especially in a delivery log.
    log.info(
      { channel, donorId, requestId, delivered: result.delivered },
      'Notification attempt'
    );
    return result;
  } catch (error) {
    log.error({ channel, donorId, requestId, reason: error.message }, 'Delivery failed');
    return { delivered: false, detail: error.message };
  }
};

export default { deliver, nextChannel, startingChannel, CHANNEL_CHAIN, CHANNEL_WAIT_MINUTES };
