'use client';

// Sign in.
//
// Note what is NOT here: no role selector.
//
// The screen this replaces offered three tabs - Donor, Blood Bank, and
// Platform Admin - and wrote whichever the visitor picked straight into
// their profile. The admin tab was gated by an "authorization code"
// that was only ever checked by a client-side `min(4)` string rule, so
// anyone could mint themselves full platform access with four
// characters.
//
// Staff and administrator accounts are now provisioned deliberately and
// the role is read from Postgres. There is nothing to choose here
// because choosing was the vulnerability.

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@rednexus/api';
import { Card, Button, Alert } from '../components/ui/index.js';
import { useAuth } from '../context/AuthContext.js';

const FRIENDLY_ERRORS = {
  'auth/invalid-credential': 'That email or password is not right.',
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/user-not-found': 'That email or password is not right.',
  'auth/wrong-password': 'That email or password is not right.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes.',
  'auth/network-request-failed': 'Could not reach the server. Check your connection.',
  'auth/operation-not-allowed':
    'Email sign-in is switched off for this project. Enable it under Authentication > Sign-in method.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/configuration-not-found':
    'Sign-in is not switched on for this project yet. Enable Authentication in the Firebase console.',
};

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) {
    router.replace('/dashboard');
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] ?? 'Could not sign you in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-lg">
      <div className="w-full max-w-sm">
        <div className="mb-lg text-center">
          <h1 className="text-xxl font-bold text-primary">Raktasetu</h1>
          <p className="mt-xs text-sm text-ink-muted">Blood bank dashboard</p>
        </div>

        <Card>
          <form onSubmit={submit}>
            <label className="mb-md block text-sm">
              <span className="mb-xs block font-medium">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full rounded-md border border-black/15 px-sm py-xs focus:border-primary focus:outline-none"
              />
            </label>

            <label className="mb-lg block text-sm">
              <span className="mb-xs block font-medium">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border border-black/15 px-sm py-xs focus:border-primary focus:outline-none"
              />
            </label>

            {error && (
              <div className="mb-md">
                <Alert tone="danger">{error}</Alert>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mt-lg text-center text-xs text-ink-muted">
          Blood bank staff accounts are created by a platform administrator.
        </p>
      </div>
    </div>
  );
}
