'use client';

// Blood bank dashboard shell.
//
// The header is built as a masthead: wordmark, a rule, then the
// institution set as a standfirst. Navigation sits on its own baseline
// underneath in tracked monospace, which keeps it quiet — staff look at
// the nav twice a day and at the content all day.
//
// The guard states are full editorial pages rather than toast messages,
// because each one is a dead stop the person has to read and act on,
// not a notification to dismiss.

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext.js';
import { Spinner, Note, Label, Button } from '../ui/index.js';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/usage', label: 'Usage' },
  { href: '/dashboard/thresholds', label: 'Thresholds' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/donors', label: 'Donors' },
  { href: '/dashboard/camps', label: 'Camps' },
  { href: '/dashboard/patients', label: 'Patients' },
  { href: '/dashboard/history', label: 'History' },
];

/** A full-page stop. Used for every state that blocks the dashboard. */
const Gate = ({ title, children }) => (
  <div className="mx-auto max-w-shell px-lg py-3xl">
    <p className="font-display text-h1 leading-none">Raktasetu</p>
    <div className="mt-2xl max-w-measure rule-top pt-lg">
      <h1 className="font-sans text-h3 font-semibold tracking-tight">{title}</h1>
      <div className="mt-md text-base text-ink-muted">{children}</div>
    </div>
  </div>
);

export default function DashboardShell({ children, title, standfirst, aside }) {
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
      <Gate title="Please sign in">
        The blood bank dashboard needs an account.
        <div className="mt-lg">
          <Link href="/login">
            <Button>Sign in</Button>
          </Link>
        </div>
      </Gate>
    );
  }

  if (error) return <Gate title="Could not load your account">{error}</Gate>;

  if (!profile?.provisioned) {
    return (
      <Gate title="This account is not staff">
        {profile?.message ?? 'Your account is not registered with a blood bank.'}
        <div className="mt-lg flex flex-wrap gap-md">
          <Link href="/apply">
            <Button>Register a blood bank</Button>
          </Link>
          <Button variant="ghost" onClick={logout}>Sign out</Button>
        </div>
      </Gate>
    );
  }

  if (profile.role !== 'BLOOD_BANK_STAFF') {
    return (
      <Gate title="You are a platform administrator">
        This dashboard is for blood bank staff. Administrators decide which
        blood banks are on the platform.
        <div className="mt-lg flex flex-wrap gap-md">
          <Link href="/admin">
            <Button>Go to administration</Button>
          </Link>
          <Button variant="ghost" onClick={logout}>Sign out</Button>
        </div>
      </Gate>
    );
  }

  const verified = profile.institution?.verificationStatus === 'VERIFIED';

  return (
    <div className="min-h-screen">
      {/* ---- Masthead ---- */}
      <header className="rule-bottom bg-paper">
        <div className="mx-auto max-w-shell px-lg">
          <div className="flex flex-wrap items-end justify-between gap-md py-lg">
            <div>
              <Link href="/dashboard" className="font-display text-h2 leading-none tracking-tight">
                Raktasetu
              </Link>
              <p className="mt-xs font-mono text-tiny text-ink-muted">
                {profile.institution?.name}
                {profile.institution?.linkedHospitalName
                  ? ` · ${profile.institution.linkedHospitalName}`
                  : ''}
              </p>
            </div>

            <div className="flex items-center gap-lg">
              <div className="text-right">
                <Label className="block">
                  {verified ? 'Verified' : profile.institution?.verificationStatus}
                </Label>
                <span className="text-tiny text-ink-muted">{profile.name}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign out
              </Button>
            </div>
          </div>

          {/* Navigation on its own baseline: tracked, monospaced, quiet. */}
          <nav className="-mb-px flex flex-wrap gap-lg overflow-x-auto">
            {NAV.map((item) => {
              const active =
                router.pathname === item.href ||
                (item.href !== '/dashboard' && router.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap border-b-rule pb-sm font-mono text-micro uppercase tracking-label transition-colors ${
                    active
                      ? 'border-blood text-blood'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-shell px-lg py-2xl">
        {title && (
          // Asymmetric by design: title takes eight columns, aside four.
          // A centred page title would be the one element here that is
          // not Swiss.
          <div className="mb-2xl grid gap-lg md:grid-cols-swiss">
            <div className="md:col-span-8">
              <h1 className="font-display text-h1 leading-none tracking-tight">{title}</h1>
              {standfirst && (
                <p className="mt-md max-w-measure text-lead text-ink-muted">{standfirst}</p>
              )}
            </div>
            {aside && <div className="md:col-span-4 md:pt-sm">{aside}</div>}
          </div>
        )}

        {!verified && (
          <div className="mb-2xl">
            <Note tone="warning" title="Awaiting verification">
              A platform administrator has not yet verified this blood bank, so
              reporting usage and confirming thresholds are unavailable. You can
              still look around.
            </Note>
          </div>
        )}

        <div className="rise">{children}</div>
      </main>

      <footer className="rule-top">
        <div className="mx-auto max-w-shell px-lg py-lg">
          <Label>Raktasetu · Consumption-based blood supply</Label>
        </div>
      </footer>
    </div>
  );
}
