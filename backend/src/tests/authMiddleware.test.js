// Regression tests for the authentication middleware.
//
// The single most important assertion in this file is that `next()` is
// never called for an unauthenticated request. A previous version of
// this middleware fell back to a hardcoded `dev-user-id` whenever the
// Firebase Admin SDK was uninitialized, which authenticated ANY Bearer
// string. These tests exist so that cannot come back.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdmin = {
  isAuthAvailable: vi.fn(),
  getUnavailableReason: vi.fn(() => 'test reason'),
  verifyIdToken: vi.fn(),
};

vi.mock('../config/firebaseAdmin.js', () => mockAdmin);
vi.mock('../lib/logger.js', () => ({
  moduleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { verifyFirebaseToken } = await import('../middleware/authMiddleware.js');

/** Minimal express req/res/next doubles. */
const makeContext = (authorization) => {
  const req = { headers: authorization ? { authorization } : {}, path: '/api/test' };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyFirebaseToken — when token verification is unavailable', () => {
  beforeEach(() => {
    mockAdmin.isAuthAvailable.mockReturnValue(false);
  });

  it('rejects a well-formed Bearer token with 503 instead of accepting it', async () => {
    const { req, res, next } = makeContext('Bearer looks-real-but-unverifiable');

    await verifyFirebaseToken(req, res, next);

    // The regression: this used to call next() with a fabricated user.
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('AUTH_UNAVAILABLE');
  });

  it('never attaches a user identity to the request', async () => {
    const { req, res, next } = makeContext('Bearer anything');

    await verifyFirebaseToken(req, res, next);

    expect(req.firebaseUid).toBeUndefined();
    expect(req.user).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('does not consult the token at all', async () => {
    const { req, res, next } = makeContext('Bearer anything');

    await verifyFirebaseToken(req, res, next);

    expect(mockAdmin.verifyIdToken).not.toHaveBeenCalled();
  });
});

describe('verifyFirebaseToken — when verification is available', () => {
  beforeEach(() => {
    mockAdmin.isAuthAvailable.mockReturnValue(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { req, res, next } = makeContext(undefined);

    await verifyFirebaseToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a non-Bearer Authorization scheme', async () => {
    const { req, res, next } = makeContext('Basic dXNlcjpwYXNz');

    await verifyFirebaseToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects an empty Bearer token', async () => {
    const { req, res, next } = makeContext('Bearer   ');

    await verifyFirebaseToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token the SDK refuses, with 401', async () => {
    mockAdmin.verifyIdToken.mockRejectedValue(
      Object.assign(new Error('Decoding Firebase ID token failed'), {
        code: 'auth/argument-error',
      })
    );
    const { req, res, next } = makeContext('Bearer forged.token.value');

    await verifyFirebaseToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(req.firebaseUid).toBeUndefined();
  });

  it('accepts a valid token and attaches only the uid', async () => {
    mockAdmin.verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123', email: 'x@example.com' });
    const { req, res, next } = makeContext('Bearer valid.token.value');

    await verifyFirebaseToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.firebaseUid).toBe('firebase-uid-123');
    expect(res.statusCode).toBeNull();
  });

  it('does not attach a role — authority comes from Postgres, not the token', async () => {
    // A token claim must never grant privileges. Even if a forged or
    // stale token carries role/admin claims, the middleware ignores them
    // and loadUser resolves authority from the database instead.
    mockAdmin.verifyIdToken.mockResolvedValue({
      uid: 'firebase-uid-123',
      role: 'PLATFORM_ADMIN',
      admin: true,
    });
    const { req, res, next } = makeContext('Bearer valid.token.value');

    await verifyFirebaseToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.role).toBeUndefined();
    expect(req.user).toBeUndefined();
  });
});
