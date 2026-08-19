'use client';

// Dashboard overview: stock against confirmed thresholds.
//
// Groups with no confirmed threshold are listed separately as "not
// being watched" rather than shown as healthy. The API makes the same
// distinction - "no opinion" and "fine" must not look identical, or an
// unconfirmed group silently reads as safe.

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getBreaches, getThresholds } from '@rednexus/api';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Alert, Spinner, Badge, Button } from '../../components/ui/index.js';

export default function DashboardHome() {
  const breaches = useQuery({ queryKey: ['breaches'], queryFn: getBreaches });
  const thresholds = useQuery({ queryKey: ['thresholds'], queryFn: () => getThresholds(28) });

  const pending = thresholds.data?.thresholds.filter((t) => t.needsConfirmation) ?? [];

  return (
    <DashboardShell title="Overview" subtitle="Where your stock stands today.">
      {(breaches.isLoading || thresholds.isLoading) && <Spinner label="Loading" />}

      {pending.length > 0 && (
        <div className="mb-lg">
          <Alert tone="warning" title={`${pending.length} blood groups have no confirmed threshold`}>
            Until you confirm them, nothing is watching those groups.{' '}
            <Link className="font-semibold text-primary underline" href="/dashboard/thresholds">
              Review suggestions
            </Link>
          </Alert>
        </div>
      )}

      {breaches.data && (
        <>
          <h2 className="mb-md text-lg font-semibold">
            Below threshold ({breaches.data.breaches.length})
          </h2>

          {breaches.data.breaches.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">
                Every group with a confirmed threshold is above it.
              </p>
            </Card>
          ) : (
            <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
              {breaches.data.breaches.map((b) => (
                <Card key={b.bloodGroup}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xxl font-bold text-primary">{b.bloodGroup}</span>
                    <Badge tone="danger">Short by {b.shortfall}</Badge>
                  </div>
                  <p className="mt-sm text-sm text-ink-muted">
                    {b.currentStock} units in stock, minimum is {b.confirmedThreshold}.
                  </p>
                </Card>
              ))}
            </div>
          )}

          {breaches.data.unmonitoredBloodGroups.length > 0 && (
            <section className="mt-xl">
              <h2 className="mb-md text-lg font-semibold">Not being watched</h2>
              <Card>
                <p className="mb-md text-sm text-ink-muted">
                  These groups have no confirmed threshold, so no one is alerted
                  if they run low.
                </p>
                <div className="flex flex-wrap gap-sm">
                  {breaches.data.unmonitoredBloodGroups.map((g) => (
                    <Badge key={g} tone="neutral">{g}</Badge>
                  ))}
                </div>
                <div className="mt-md">
                  <Link href="/dashboard/thresholds">
                    <Button variant="secondary">Set thresholds</Button>
                  </Link>
                </div>
              </Card>
            </section>
          )}
        </>
      )}
    </DashboardShell>
  );
}
