'use client';

// Dashboard overview.
//
// The page answers one question — is anything short right now — and the
// layout says so before any text does. Breaches are set as editorial
// cards with the blood group in display serif and the shortfall as a
// large figure; everything healthy is compressed into a quiet strip.
//
// Groups with no confirmed threshold get their own section rather than
// being folded into "fine". The API makes the same distinction: "no
// opinion" and "healthy" must not look identical, or an unwatched group
// silently reads as safe.

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getBreaches, getThresholds } from '@rednexus/api';
import DashboardShell from '../../components/layout/DashboardShell.js';
import {
  Panel, Section, Note, Spinner, Badge, Button, Label, BloodGroup,
} from '../../components/ui/index.js';

export default function DashboardHome() {
  const breaches = useQuery({ queryKey: ['breaches'], queryFn: getBreaches });
  const thresholds = useQuery({ queryKey: ['thresholds'], queryFn: () => getThresholds(28) });

  const pending = thresholds.data?.thresholds.filter((t) => t.needsConfirmation) ?? [];
  const active = thresholds.data?.thresholds.filter((t) => !t.needsConfirmation) ?? [];
  const short = breaches.data?.breaches ?? [];
  const unwatched = breaches.data?.unmonitoredBloodGroups ?? [];

  return (
    <DashboardShell
      title="Overview"
      standfirst="Where your stock stands against the minimums you confirmed."
      aside={
        <div className="grid grid-cols-2 gap-lg">
          <div>
            <Label className="block">Watched</Label>
            <p className="mt-xs font-display text-h2 leading-none tabular">{active.length}</p>
          </div>
          <div>
            <Label className="block">Below minimum</Label>
            <p className={`mt-xs font-display text-h2 leading-none tabular ${short.length ? 'text-blood' : ''}`}>
              {short.length}
            </p>
          </div>
        </div>
      }
    >
      {(breaches.isLoading || thresholds.isLoading) && <Spinner label="Reading stock" />}

      {pending.length > 0 && (
        <div className="mb-2xl">
          <Note tone="warning" title={`${pending.length} groups have no confirmed minimum`}>
            Nothing is watching those groups until you confirm them.{' '}
            <Link className="text-blood underline underline-offset-4" href="/dashboard/thresholds">
              Review the suggestions
            </Link>
          </Note>
        </div>
      )}

      {breaches.data && (
        <>
          <Section index={1} title="Below minimum" aside={`${short.length} of ${active.length} watched`}>
            {short.length === 0 ? (
              <Panel>
                <p className="text-base text-ink-muted">
                  Every group with a confirmed minimum is above it.
                </p>
              </Panel>
            ) : (
              <div className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
                {short.map((b) => (
                  <Panel key={b.bloodGroup} accent="blood">
                    <div className="flex items-start justify-between">
                      <BloodGroup>{b.bloodGroup}</BloodGroup>
                      {b.clearsShortfall ? (
                        <Badge tone="warning">Arriving</Badge>
                      ) : (
                        <Badge tone="danger">Short {b.shortfall}</Badge>
                      )}
                    </div>

                    <dl className="mt-lg">
                      <div className="flex items-baseline justify-between rule-bottom py-sm">
                        <Label>In stock</Label>
                        <dd className="font-mono text-small tabular">{b.currentStock}</dd>
                      </div>
                      <div className="flex items-baseline justify-between rule-bottom py-sm">
                        <Label>Minimum</Label>
                        <dd className="font-mono text-small tabular">{b.confirmedThreshold}</dd>
                      </div>
                      {b.awaitingScreening > 0 && (
                        <div className="flex items-baseline justify-between py-sm">
                          <Label>In screening</Label>
                          <dd className="font-mono text-small tabular">{b.awaitingScreening}</dd>
                        </div>
                      )}
                    </dl>

                    {b.countedOn && (
                      <p className="mt-md text-tiny text-ink-faint">
                        {b.countedStock} counted on{' '}
                        {new Date(b.countedOn).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short',
                        })}
                        {b.releasedSinceCount > 0 && `, plus ${b.releasedSinceCount} released since`}
                      </p>
                    )}
                  </Panel>
                ))}
              </div>
            )}
          </Section>

          {unwatched.length > 0 && (
            <Section index={2} title="Not being watched" className="mt-2xl">
              <Panel>
                <p className="max-w-measure text-base text-ink-muted">
                  These groups have no confirmed minimum, so nobody is alerted if
                  they run low.
                </p>
                <div className="mt-lg flex flex-wrap gap-sm">
                  {unwatched.map((g) => (
                    <Badge key={g}>{g}</Badge>
                  ))}
                </div>
                <div className="mt-lg">
                  <Link href="/dashboard/thresholds">
                    <Button variant="secondary">Set minimums</Button>
                  </Link>
                </div>
              </Panel>
            </Section>
          )}
        </>
      )}
    </DashboardShell>
  );
}
