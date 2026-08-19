'use client';

// Sign in.
//
// A two-panel editorial spread: the left states what the product is,
// the right does the work. Splitting them lets the form stay almost
// empty — five elements — while the page still says something.
//
// Note what is NOT here: no role selector. The screen this replaced
// offered Donor / Blood Bank / Platform Admin tabs and wrote whichever
// the visitor picked into their profile, with the admin tab gated by an
// "authorization code" checked only by a client-side min(4) rule. Roles
// are provisioned now. There is nothing to choose, because choosing was
// the vulnerability.

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@rednexus/api';
import { Button, Label, Note } from '../components/ui/index.js';
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

  // The index routes by role; login cannot know the role yet.
  if (isAuthenticated) {
    router.replace('/');
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(FRIENDLY_ERRORS[err.code] ?? 'Could not sign you in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen md:grid md:grid-cols-2">
      {/* ---- Left: the argument ---- */}
      <section className="flex flex-col justify-between border-rule px-lg py-2xl md:border-r md:px-2xl md:py-3xl">
        <div>
          <p className="font-display text-h2 leading-none tracking-tight">Raktasetu</p>
          <Label className="mt-sm block">Consumption-based blood supply</Label>
        </div>

        <div className="my-2xl max-w-measure">
          <h1 className="font-display text-h1 leading-[1.02] tracking-tight md:text-display">
            Blood banks collect in bursts.
            <br />
            Hospitals use it <em className="not-italic text-blood">every day.</em>
          </h1>
          <p className="mt-lg text-lead text-ink-muted">
            Raktasetu measures what a blood bank actually issues, turns that into
            a minimum stock level and a weekly collection target, and asks a
            named person to approve both.
          </p>
        </div>

        {/* Three facts as a Swiss data strip. */}
        <dl className="grid grid-cols-3 gap-md rule-top pt-lg">
          {[
            ['8', 'Blood groups tracked separately'],
            ['0', 'Alerts sent without approval'],
            ['5–7', 'Days ahead for regular patients'],
          ].map(([figure, caption]) => (
            <div key={caption}>
              <dd className="font-display text-h2 leading-none tabular">{figure}</dd>
              <dt className="mt-sm text-tiny leading-snug text-ink-faint">{caption}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ---- Right: the work ---- */}
      <section className="flex items-center px-lg py-2xl md:px-2xl">
        <div className="w-full max-w-sm">
          <Label>Sign in</Label>
          <h2 className="mt-sm font-sans text-h3 font-semibold tracking-tight">Your account</h2>

          <form onSubmit={submit} className="mt-xl">
            <div className="mb-xl">
              <Label as="label" className="mb-xs block">
                Email
              </Label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="field"
              />
            </div>

            <div className="mb-xl">
              <Label as="label" className="mb-xs block">
                Password
              </Label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="field"
              />
            </div>

            {error && (
              <div className="mb-lg">
                <Note tone="danger">{error}</Note>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-2xl rule-top pt-lg">
            <p className="text-small text-ink-muted">
              New donor?{' '}
              <Link className="text-blood underline underline-offset-4" href="/register">
                Register here
              </Link>
            </p>
            <p className="mt-xs text-small text-ink-muted">
              Registering a blood bank?{' '}
              <Link className="text-blood underline underline-offset-4" href="/apply">
                Apply here
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
