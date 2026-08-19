// Request state machine tests.
//
// Rules section 6: "The request state machine must have tests
// confirming illegal transitions are rejected (e.g. RAISED -> DONATED
// without passing through intermediate states)."
//
// The named example matters concretely: RAISED -> DONATED would record
// a donation against a request nobody was ever notified about, which
// would corrupt the "notifications sent per successful donation" metric
// the product is judged on (PRD section 8).

import { describe, it, expect } from 'vitest';
import {
  STATE,
  TRANSITIONS,
  canTransition,
  assertTransition,
  isTerminal,
  isApproved,
  IllegalTransitionError,
  NOTIFIABLE_STATES,
} from '../lib/stateMachine.js';

describe('the happy path', () => {
  it('walks DETECTED through to CLOSED one step at a time', () => {
    const path = [
      STATE.DETECTED,
      STATE.RAISED,
      STATE.NOTIFIED,
      STATE.ACCEPTED,
      STATE.CONFIRMED,
      STATE.ARRIVED,
      STATE.DONATED,
      STATE.CLOSED,
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });
});

describe('illegal transitions', () => {
  it('★ rejects RAISED -> DONATED', () => {
    // The example Rules section 6 names by hand.
    expect(canTransition(STATE.RAISED, STATE.DONATED)).toBe(false);
    expect(() => assertTransition(STATE.RAISED, STATE.DONATED)).toThrow(IllegalTransitionError);
  });

  it('rejects every skip-ahead from DETECTED except RAISED', () => {
    const reachable = [STATE.RAISED, STATE.CANCELLED];
    for (const target of Object.values(STATE)) {
      if (reachable.includes(target)) continue;
      expect(canTransition(STATE.DETECTED, target)).toBe(false);
    }
  });

  it('★ rejects DETECTED -> NOTIFIED — the gate cannot be jumped', () => {
    // If this ever passes, a system-detected alert reaches donors with
    // no human approval, which is the one thing the product promises
    // cannot happen.
    expect(canTransition(STATE.DETECTED, STATE.NOTIFIED)).toBe(false);
  });

  it('rejects moving backwards to DETECTED from anywhere', () => {
    for (const from of Object.values(STATE)) {
      expect(canTransition(from, STATE.DETECTED)).toBe(false);
    }
  });

  it('rejects reopening a CLOSED request', () => {
    for (const target of Object.values(STATE)) {
      expect(canTransition(STATE.CLOSED, target)).toBe(false);
    }
  });

  it('rejects resurrecting a CANCELLED request', () => {
    for (const target of Object.values(STATE)) {
      expect(canTransition(STATE.CANCELLED, target)).toBe(false);
    }
  });

  it('rejects ARRIVED -> CLOSED without recording the donation', () => {
    expect(canTransition(STATE.ARRIVED, STATE.CLOSED)).toBe(false);
  });

  it('names what IS allowed in the error message', () => {
    try {
      assertTransition(STATE.RAISED, STATE.DONATED);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.message).toContain('NOTIFIED');
      expect(e.status).toBe(409);
    }
  });
});

describe('escalation and re-widening', () => {
  it('allows NOTIFIED -> NOTIFIED for a wider batch', () => {
    expect(canTransition(STATE.NOTIFIED, STATE.NOTIFIED)).toBe(true);
  });

  it('allows going back to NOTIFIED when acceptances fall short', () => {
    expect(canTransition(STATE.ACCEPTED, STATE.NOTIFIED)).toBe(true);
    expect(canTransition(STATE.CONFIRMED, STATE.NOTIFIED)).toBe(true);
  });
});

describe('cancellation', () => {
  it('is reachable from every live state', () => {
    const live = [
      STATE.DETECTED, STATE.RAISED, STATE.NOTIFIED,
      STATE.ACCEPTED, STATE.CONFIRMED, STATE.ARRIVED,
    ];
    for (const from of live) {
      expect(canTransition(from, STATE.CANCELLED)).toBe(true);
    }
  });

  it('is NOT reachable once a donation has been recorded', () => {
    // Cancelling after the fact would erase a real donation.
    expect(canTransition(STATE.DONATED, STATE.CANCELLED)).toBe(false);
  });
});

describe('helpers', () => {
  it('treats only CLOSED and CANCELLED as terminal', () => {
    expect(isTerminal(STATE.CLOSED)).toBe(true);
    expect(isTerminal(STATE.CANCELLED)).toBe(true);
    expect(isTerminal(STATE.DETECTED)).toBe(false);
  });

  it('★ does not consider DETECTED approved', () => {
    expect(isApproved(STATE.DETECTED)).toBe(false);
    expect(isApproved(STATE.RAISED)).toBe(true);
  });

  it('★ allows donor notification only after the gate', () => {
    expect(NOTIFIABLE_STATES).not.toContain(STATE.DETECTED);
    expect(NOTIFIABLE_STATES).toContain(STATE.RAISED);
  });

  it('defines transitions for every state, so none is a dead end by accident', () => {
    for (const state of Object.values(STATE)) {
      expect(TRANSITIONS[state]).toBeDefined();
    }
  });
});
