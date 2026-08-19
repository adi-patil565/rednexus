'use client';

// Donor app shell.
//
// Written for the donor base actually surveyed at camps: varying
// literacy, varying smartphone familiarity, often on a phone with a
// patchy connection. Rules section 7 asks for plain language and no
// jargon, which here means short sentences, no product vocabulary
// ("eligibility window", "targeting pool"), and never more than one
// thing to decide at a time.

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext.js';
import { Spinner, Alert, Button } from '../ui/index.js';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/donations', label: 'My donations' },
  { href: '/preferences', label: 'Settings' },
];

export default function DonorShell({ children, title }) {
  const { isLoading, isAuthenticated, profile, error, logout } = useAuth();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md p-xl">
        <h1 className="mb-lg text-center text-xxl font-bold text-primary">Raktasetu</h1>
        <Alert tone="info" title="Please sign in">
          Sign in to see if blood of your group is needed nearby.
          <div className="mt-md flex gap-md">
            <Link href="/login">
              <Button>Sign in</Button>
            </Link>
            <Link href="/register">
              <Button variant="secondary">Register as a donor</Button>
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-xl">
        <Alert tone="danger" title="Something went wrong">{error}</Alert>
      </div>
    );
  }

  // Signed in with Firebase but no donor record. Most likely a staff
  // account that landed on the wrong surface.
  if (profile?.kind !== 'DONOR') {
    return (
      <div className="mx-auto max-w-md p-xl">
        <Alert tone="info" title="This is the donor app">
          {profile?.kind === 'STAFF' || profile?.kind === 'ADMIN' ? (
            <>
              Your account belongs to a blood bank.{' '}
              <Link className="font-semibold text-primary underline" href="/dashboard">
                Go to the dashboard
              </Link>
            </>
          ) : (
            <>
              This account is not registered as a donor yet.{' '}
              <Link className="font-semibold text-primary underline" href="/register">
                Register
              </Link>
            </>
          )}
          <div className="mt-md">
            <Button variant="secondary" onClick={logout}>Sign out</Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-lg py-md">
          <div>
            <p className="text-lg font-bold text-primary">Raktasetu</p>
            <p className="text-xs text-ink-muted">{profile.name}</p>
          </div>
          <Button variant="ghost" onClick={logout}>Sign out</Button>
        </div>

        <nav className="mx-auto flex max-w-2xl gap-lg px-lg">
          {NAV.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`-mb-px border-b-2 pb-sm text-sm font-medium ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-lg py-xl">
        {title && <h1 className="mb-lg text-xl font-bold">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
