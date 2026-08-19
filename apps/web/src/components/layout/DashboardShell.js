'use client';

// Blood bank dashboard shell: navigation, identity, and the guard that
// decides whether the person may act at all.
//
// The guard is not decoration. An unverified institution is blocked
// server-side on every endpoint; showing that plainly here means staff
// learn it from the screen rather than from a failed submission.

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext.js';
import { Spinner, Alert, Badge, Button } from '../ui/index.js';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/usage', label: 'Daily usage' },
  { href: '/dashboard/thresholds', label: 'Thresholds' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/donors', label: 'Donors' },
];

export default function DashboardShell({ children, title, subtitle }) {
  const { isLoading, isAuthenticated, profile, error, logout } = useAuth();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading your account" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-md p-xl">
        <Alert tone="info" title="Please sign in">
          You need to sign in to use the blood bank dashboard.{' '}
          <Link className="font-semibold text-primary underline" href="/login">
            Go to sign in
          </Link>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-xl">
        <Alert tone="danger" title="Could not load your account">
          {error}
        </Alert>
      </div>
    );
  }

  // Signed in with Firebase but not provisioned as staff. Staff accounts
  // are created deliberately - nobody self-registers into a blood bank.
  if (!profile?.provisioned) {
    return (
      <div className="mx-auto max-w-md p-xl">
        <Alert tone="warning" title="This account is not staff">
          {profile?.message ?? 'Your account is not registered with a blood bank.'}
          <div className="mt-md">
            <Button variant="secondary" onClick={logout}>
              Sign out
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (profile.role !== 'BLOOD_BANK_STAFF') {
    // A dead end is a bug. An admin who lands here needs the door, not
    // just the explanation.
    return (
      <div className="mx-auto max-w-md p-xl">
        <Alert tone="info" title="You are a platform administrator">
          This dashboard is for blood bank staff. Administrators verify which
          blood banks are on the platform.
          <div className="mt-md flex gap-md">
            <Link href="/admin">
              <Button>Go to administration</Button>
            </Link>
            <Button variant="secondary" onClick={logout}>
              Sign out
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  const verified = profile.institution?.verificationStatus === 'VERIFIED';

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-lg py-md">
          <div>
            <p className="text-lg font-bold text-primary">Raktasetu</p>
            <p className="text-xs text-ink-muted">
              {profile.institution?.name}
              {profile.institution?.linkedHospitalName
                ? ` · ${profile.institution.linkedHospitalName}`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-md">
            <Badge tone={verified ? 'success' : 'warning'}>
              {verified ? 'Verified' : profile.institution?.verificationStatus}
            </Badge>
            <span className="text-sm text-ink-muted">{profile.name}</span>
            <Button variant="ghost" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-lg px-lg">
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

      <main className="mx-auto max-w-6xl px-lg py-xl">
        {title && (
          <div className="mb-lg">
            <h1 className="text-xxl font-bold">{title}</h1>
            {subtitle && <p className="mt-xs text-sm text-ink-muted">{subtitle}</p>}
          </div>
        )}

        {!verified && (
          <div className="mb-lg">
            <Alert tone="warning" title="Awaiting verification">
              A platform administrator has not yet verified this blood bank, so
              reporting usage and confirming thresholds are unavailable. You can
              still look around.
            </Alert>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
