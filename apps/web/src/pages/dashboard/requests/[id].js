'use client';

// Active request detail — who was contacted, who accepted, what next.
//
// The donor table is where F7 becomes visible. Contact details appear
// only for donors who ACCEPTED this request; everyone else is an id and
// a status. That is not a display choice made here - the API withholds
// them, so there is nothing to leak even by mistake.
//
// The escalation control is deliberately manual. F5 staged escalation
// automates the timing in Phase 6, but widening the pool is still a
// decision about contacting more people, and it stays a decision.

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRequest, notifyDonors, transitionRequest, toFormError } from '@rednexus/api';
import DashboardShell from '../../../components/layout/DashboardShell.js';
import { Card, Button, Alert, Spinner, Badge } from '../../../components/ui/index.js';

const RESPONSE_TONE = {
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  PENDING: 'info',
  EXPIRED: 'neutral',
};

const RESPONSE_LABEL = {
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  PENDING: 'No answer yet',
  EXPIRED: 'No answer',
};

// What a staff member may do next, given where the request is. Mirrors
// the server-side state machine; the server is still the authority, so
// an illegal move returns 409 rather than being silently allowed.
const NEXT_STEPS = {
  ACCEPTED: [{ to: 'CONFIRMED', label: 'Confirm donors' }],
  CONFIRMED: [{ to: 'ARRIVED', label: 'Donor arrived' }],
  ARRIVED: [{ to: 'DONATED', label: 'Donation complete' }],
  DONATED: [{ to: 'CLOSED', label: 'Close request' }],
};

export default function RequestDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['request', id],
    queryFn: () => getRequest(id),
    enabled: Boolean(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['request', id] });
    queryClient.invalidateQueries({ queryKey: ['requests'] });
  };

  const notify = useMutation({
    mutationFn: () => notifyDonors(id),
    onSuccess: refresh,
    onError: (e) => setError(toFormError(e).message),
  });

  const move = useMutation({
    mutationFn: (to) => transitionRequest(id, to),
    onSuccess: refresh,
    onError: (e) => setError(toFormError(e).message),
  });

  const donors = data?.donors ?? [];
  const accepted = donors.filter((d) => d.response === 'ACCEPTED');
  const pending = donors.filter((d) => d.response === 'PENDING');
  const declined = donors.filter((d) => d.response === 'DECLINED');

  const enough = data ? accepted.length >= data.unitsNeeded : false;
  const steps = data ? (NEXT_STEPS[data.state] ?? []) : [];

  return (
    <DashboardShell title={data ? `${data.bloodGroup} — ${data.unitsNeeded} units` : 'Request'}>
      <div className="mb-lg">
        <Link href="/dashboard/alerts" className="text-small text-blood underline">
          ← Back to alerts
        </Link>
      </div>

      {isLoading && <Spinner label="Loading request" />}
      {isError && <Alert tone="danger">Could not load this request.</Alert>}
      {error && (
        <div className="mb-lg">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {data && (
        <>
          <Card className="mb-lg">
            <div className="flex flex-wrap items-center gap-md">
              <Badge tone={data.state === 'CLOSED' ? 'neutral' : 'info'}>{data.state}</Badge>
              {data.urgent && <Badge tone="danger">Urgent</Badge>}
              <span className="text-small text-ink-muted">
                Approved by {data.confirmedBy ?? 'staff'}
                {data.confirmedAt &&
                  ` on ${new Date(data.confirmedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}`}
              </span>
            </div>

            {data.basis && (
              <p className="mt-md rounded-md bg-paper p-md text-small text-ink-muted">
                {data.basis}
              </p>
            )}

            <div className="mt-lg grid gap-md sm:grid-cols-4">
              {[
                ['Contacted', donors.length],
                ['Accepted', accepted.length],
                ['Declined', declined.length],
                ['Needed', data.unitsNeeded],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-h3 font-bold text-blood">{value}</p>
                  <p className="text-tiny text-ink-muted">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-lg flex flex-wrap gap-md">
              {(data.state === 'RAISED' || data.state === 'NOTIFIED') && (
                <Button onClick={() => notify.mutate()} disabled={notify.isPending}>
                  {notify.isPending
                    ? 'Contacting…'
                    : data.stageLevel === 0
                      ? 'Contact donors'
                      : 'Contact more donors'}
                </Button>
              )}

              {steps.map((step) => (
                <Button
                  key={step.to}
                  onClick={() => move.mutate(step.to)}
                  disabled={move.isPending}
                >
                  {step.label}
                </Button>
              ))}

              {!['CLOSED', 'CANCELLED'].includes(data.state) && (
                <Button
                  variant="secondary"
                  onClick={() => move.mutate('CANCELLED')}
                  disabled={move.isPending}
                >
                  Cancel request
                </Button>
              )}
            </div>

            {enough && data.state === 'ACCEPTED' && (
              <p className="mt-md text-small text-positive">
                Enough donors have accepted. Confirm them and let the rest know
                they are not needed.
              </p>
            )}

            {data.stageLevel > 0 && !enough && (
              <p className="mt-md text-tiny text-ink-muted">
                Round {data.stageLevel}. Contacting more widens the pool — nobody
                already asked is contacted again.
              </p>
            )}
          </Card>

          <h2 className="mb-md text-h4 font-semibold">Donors contacted ({donors.length})</h2>

          {donors.length === 0 ? (
            <Card>
              <p className="text-small text-ink-muted">
                Nobody has been contacted yet.
              </p>
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-small">
                <thead>
                  <tr className="border-b border-rule text-left text-tiny uppercase tracking-wide text-ink-muted">
                    <th className="pb-sm">Donor</th>
                    <th className="pb-sm">Area</th>
                    <th className="pb-sm">Round</th>
                    <th className="pb-sm">Response</th>
                    <th className="pb-sm">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {[...accepted, ...pending, ...declined].map((d) => (
                    <tr key={d.donorId} className="border-b border-black/5">
                      <td className="py-sm font-mono text-tiny">{d.donorId.slice(0, 8)}</td>
                      <td className="py-sm">{d.areaPincode}</td>
                      <td className="py-sm">{d.stage}</td>
                      <td className="py-sm">
                        <Badge tone={RESPONSE_TONE[d.response]}>
                          {RESPONSE_LABEL[d.response]}
                        </Badge>
                      </td>
                      <td className="py-sm">
                        {d.phone ? (
                          <span>
                            {d.name} · {d.phone}
                          </span>
                        ) : (
                          <span className="text-tiny text-ink-muted">
                            Shown once they accept
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <p className="mt-md text-tiny text-ink-muted">
            Donor names and phone numbers are shown only for people who accepted
            this request. Being asked is not the same as agreeing to be
            contacted directly.
          </p>
        </>
      )}
    </DashboardShell>
  );
}
