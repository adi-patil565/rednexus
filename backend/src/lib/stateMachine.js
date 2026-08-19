// Request state machine.
//
// Rules section 2: "Every request-state-affecting endpoint must move
// the request through the defined state machine explicitly. No endpoint
// should silently mutate request status outside this machine."
//
// So the legal transitions live in one table, and request.service.js is
// the only module allowed to write Request.state. Rules section 6
// requires tests proving illegal transitions are rejected - notably
// RAISED -> DONATED, which would mean a donation recorded against a
// request nobody was ever notified about.

export const STATE = {
  DETECTED: 'DETECTED',
  RAISED: 'RAISED',
  NOTIFIED: 'NOTIFIED',
  ACCEPTED: 'ACCEPTED',
  CONFIRMED: 'CONFIRMED',
  ARRIVED: 'ARRIVED',
  DONATED: 'DONATED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
};

// Anything not listed here is illegal, including every skip-ahead.
export const TRANSITIONS = {
  // The confirmation gate. DETECTED can only become RAISED, and only
  // through the dedicated confirm path.
  DETECTED: [STATE.RAISED, STATE.CANCELLED],

  RAISED: [STATE.NOTIFIED, STATE.CANCELLED],

  // Self-loop is F5 escalation: notify a wider batch without leaving
  // the state. Not a no-op - it increments stageLevel.
  NOTIFIED: [STATE.NOTIFIED, STATE.ACCEPTED, STATE.CANCELLED],

  // Back to NOTIFIED when accepted donors are not enough and the pool
  // has to widen again.
  ACCEPTED: [STATE.CONFIRMED, STATE.NOTIFIED, STATE.CANCELLED],
  CONFIRMED: [STATE.ARRIVED, STATE.NOTIFIED, STATE.CANCELLED],

  ARRIVED: [STATE.DONATED, STATE.CANCELLED],
  DONATED: [STATE.CLOSED],

  // Terminal.
  CLOSED: [],
  CANCELLED: [],
};

/** States a donor may be notified in. */
export const NOTIFIABLE_STATES = [STATE.RAISED, STATE.NOTIFIED];

/** True once the request has been through the human gate. */
export const isApproved = (state) =>
  state !== STATE.DETECTED && state !== STATE.CANCELLED;

export const isTerminal = (state) => TRANSITIONS[state]?.length === 0;

export const canTransition = (from, to) => Boolean(TRANSITIONS[from]?.includes(to));

/**
 * Thrown rather than returned, so a caller cannot ignore it and write
 * the state anyway.
 */
export class IllegalTransitionError extends Error {
  constructor(from, to) {
    const allowed = TRANSITIONS[from]?.join(', ') || 'nothing (terminal state)';
    super(`Cannot move a request from ${from} to ${to}. Allowed from ${from}: ${allowed}.`);
    this.name = 'IllegalTransitionError';
    this.code = 'ILLEGAL_TRANSITION';
    this.from = from;
    this.to = to;
    this.status = 409;
  }
}

export const assertTransition = (from, to) => {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
};

export default { STATE, TRANSITIONS, canTransition, assertTransition, IllegalTransitionError };
