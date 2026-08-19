'use client';

// Donor app shell.
//
// A different register from the staff dashboard on purpose. Blood bank
// screens are instruments used all day; this is read once on a phone,
// possibly while queuing at a camp, by someone doing a favour. So the
// measure is narrower, the type is larger, and there is less on screen.
//
// Rules section 7 asks for plain language and no jargon. Visually that
// means the same thing: no dense tables, no dashboards, one decision at
// a time.

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext.js';
import { Spinner, Label, Button } from '../ui/index.js';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/camps', label: 'Camps' },
  { href: '/donations', label: 'Donations' },
  { href: '/preferences', label: 'Settings' },
];

const Gate = ({ title, children }) => (
  <div className="mx-auto max-w-measure px-lg py-3xl">
    <p className="font-display text-h1 leading-none">Raktasetu</p>
    <div className="mt-2xl rule-top pt-lg">
      <h1 className="font-sans text-h3 font-semibold tracking-tight">{title}</h1>
      <div className="mt-md text-base text-ink-muted">{children}</div>
    </div>
  </div>
);

export default function DonorShell({ children, title, standfirst }) {
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
      <Gate title="Blood needed near you">
        Sign in to see when blood of your group is needed nearby, and to answer
        when it is.
        <div className="mt-lg flex flex-wrap gap-md">
          <Link href="/login"><Button>Sign in</Button></Link>
          <Link href="/register"><Button variant="secondary">Register as a donor</Button></Link>
        </div>
        <p className="mt-lg text-small text-ink-faint">
          Run a blood bank?{' '}
          <Link className="text-blood underline underline-offset-4" href="/apply">
            Register it here
          </Link>
        </p>
      </Gate>
    );
  }

  if (error) return <Gate title="Something went wrong">{error}</Gate>;

  if (profile?.kind !== 'DONOR') {
    return (
      <Gate title="This is the donor app">
        {profile?.kind === 'STAFF' ? (
          <>Your account belongs to a blood bank.</>
        ) : profile?.kind === 'ADMIN' ? (
          <>You are a platform administrator.</>
        ) : (
          <>This account is not registered yet. Are you a donor, or a blood bank?</>
        )}
        <div className="mt-lg flex flex-wrap gap-md">
          {profile?.kind === 'STAFF' && (
            <Link href="/dashboard"><Button>Go to the dashboard</Button></Link>
          )}
          {profile?.kind === 'ADMIN' && (
            <Link href="/admin"><Button>Go to administration</Button></Link>
          )}
          {!profile?.kind && (
            <>
              <Link href="/register"><Button>Register as a donor</Button></Link>
              <Link href="/apply"><Button variant="secondary">Register a blood bank</Button></Link>
            </>
          )}
          <Button variant="ghost" onClick={logout}>Sign out</Button>
        </div>
      </Gate>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="rule-bottom">
        <div className="mx-auto max-w-2xl px-lg">
          <div className="flex items-end justify-between gap-md py-lg">
            <div>
              <Link href="/" className="font-display text-h3 leading-none tracking-tight">
                Raktasetu
              </Link>
              <p className="mt-xs font-mono text-tiny text-ink-muted">{profile.name}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>Sign out</Button>
          </div>

          <nav className="-mb-px flex gap-lg">
            {NAV.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border-b-rule pb-sm font-mono text-micro uppercase tracking-label transition-colors ${
                    active ? 'border-blood text-blood' : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-lg py-2xl">
        {title && (
          <div className="mb-xl">
            <h1 className="font-display text-h2 leading-none tracking-tight">{title}</h1>
            {standfirst && <p className="mt-md text-lead text-ink-muted">{standfirst}</p>}
          </div>
        )}
        <div className="rise">{children}</div>
      </main>

      <footer className="rule-top">
        <div className="mx-auto max-w-2xl px-lg py-lg">
          <Label>Your details are never shown to patients or their families</Label>
        </div>
      </footer>
    </div>
  );
}
