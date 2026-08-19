'use client';

// Donor home.
//
// Two things, in this order: anything waiting for an answer, then
// whether they can donate and when.
//
// The register is deliberately unlike the staff dashboard. This is read
// once, on a phone, possibly in a queue, by someone doing a favour — so
// the blood group is set large in display serif, there is one decision
// per card, and nothing is a table.
//
// Deliberately absent from an alert: who the blood is for. Rules
// section 1 forbids a donor-to-patient channel, and naming the patient
// would manufacture one out of a notification.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyAlerts, respondToRequest, toFormError } from '@rednexus/api';
import DonorShell from '../components/layout/DonorShell.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Panel,
  Note,
  Spinner,
  Badge,
  Button,
  Label,
  BloodGroup,
} from '../components/ui/index.js';

function AlertCard({ alert, onDone }) {
  const [error, setError] = useState(null);

  const answer = useMutation({
    mutationFn: (accept) => respondToRequest(alert.requestId, accept),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  return (
    <Panel accent="blood" className="mb-lg">
      <div className="flex items-start justify-between gap-md">
        <div>
          <Label className="block">Needed now</Label>
          <div className="mt-sm flex items-baseline gap-md">
            <BloodGroup size="lg">{alert.bloodGroup}</BloodGroup>
            <span className="font-mono text-small tabular text-ink-muted">
              {alert.unitsNeeded} {alert.unitsNeeded === 1 ? 'unit' : 'units'}
            </span>
          </div>
        </div>
        {alert.urgent && <Badge tone="danger">Urgent</Badge>}
      </div>

      <p className="mt-lg text-base text-ink">
        <span className="font-medium">{alert.bloodBank}</span> needs blood of your
        group. They are in area {alert.area}.
      </p>

      <div className="mt-xl flex flex-wrap gap-md">
        <Button size="lg" onClick={() => answer.mutate(true)} disabled={answer.isPending}>
          {answer.isPending ? 'Sending…' : 'Yes, I can donate'}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => answer.mutate(false)}
          disabled={answer.isPending}
        >
          Not this time
        </Button>
      </div>

      <p className="mt-md text-tiny text-ink-faint">
        Saying yes shares your name and phone number with this blood bank so they
        can arrange a time. Nobody else sees them.
      </p>

      {error && <p className="mt-sm text-tiny text-blood">{error}</p>}
    </Panel>
  );
}

export default function DonorHome() {
  const { profile, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  // This route is the donor home AND the post-login landing point, so
  // role dispatch belongs here. Staff and admins go to their own
  // surface rather than a donor page they cannot use.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (profile?.kind === 'ADMIN') router.replace('/admin');
    else if (profile?.kind === 'STAFF') router.replace('/dashboard');
  }, [isLoading, isAuthenticated, profile, router]);

  const { data, isLoading: alertsLoading } = useQuery({
    queryKey: ['my-alerts'],
    queryFn: getMyAlerts,
    enabled: isAuthenticated && profile?.kind === 'DONOR',
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-alerts'] });

  const open = data?.alerts.filter((a) => a.canRespond) ?? [];
  const answered = data?.alerts.filter((a) => !a.canRespond) ?? [];

  return (
    <DonorShell>
      {/* Anything needing an answer comes first, above status. */}
      {open.length > 0 && (
        <section className="mb-2xl">
          <h1 className="mb-lg font-display text-h2 leading-tight tracking-tight">
            {open.length === 1
              ? 'Someone needs blood'
              : `${open.length} requests need an answer`}
          </h1>
          {open.map((a) => (
            <AlertCard key={a.requestId} alert={a} onDone={refresh} />
          ))}
        </section>
      )}

      {profile?.kind === 'DONOR' && (
        <Panel className="mb-xl">
          <div className="flex items-start justify-between gap-md">
            <div>
              <Label className="block">Your blood group</Label>
              <div className="mt-sm">
                <BloodGroup size="lg">
                  {profile.bloodGroupVerified ?? profile.bloodGroup}
                </BloodGroup>
              </div>
              {!profile.bloodGroupVerified && (
                <p className="mt-sm max-w-measure text-tiny text-ink-faint">
                  As you told us. The blood bank confirms this when you donate.
                </p>
              )}
            </div>
            <Badge tone={profile.eligible ? 'success' : 'neutral'}>
              {profile.eligible ? 'Can donate' : 'Not just now'}
            </Badge>
          </div>

          {/* Plain language, no product vocabulary. */}
          <p className="mt-lg rule-top pt-lg text-lead text-ink">
            {profile.eligibilityMessage}
          </p>

          {profile.status === 'PENDING_REVIEW' && (
            <div className="mt-lg">
              <Note tone="info">
                Blood bank staff are checking your details. You will not be asked
                to donate until that is done.
              </Note>
            </div>
          )}

          {profile.notificationsPaused && (
            <div className="mt-lg">
              <Note tone="warning" title="Paused">
                You have paused requests, so we will not contact you.{' '}
                <Link className="text-blood underline underline-offset-4" href="/preferences">
                  Turn them back on
                </Link>
              </Note>
            </div>
          )}
        </Panel>
      )}

      {alertsLoading && <Spinner label="Checking for requests" />}

      {!alertsLoading && open.length === 0 && (
        <Panel>
          <p className="text-base text-ink-muted">
            Nothing needs your answer right now. We will let you know when blood
            of your group is needed nearby.
          </p>
        </Panel>
      )}

      {answered.length > 0 && (
        <section className="mt-2xl">
          <Label className="mb-md block">Earlier requests</Label>
          {answered.slice(0, 8).map((a) => (
            <div
              key={a.requestId}
              className="flex items-center justify-between gap-md rule-bottom py-md"
            >
              <span className="text-small">
                <strong className="font-display text-h4 text-blood">{a.bloodGroup}</strong>
                <span className="ml-md text-ink-muted">{a.bloodBank}</span>
              </span>
              <Badge tone={a.response === 'ACCEPTED' ? 'success' : 'neutral'}>
                {a.response === 'ACCEPTED'
                  ? 'You said yes'
                  : a.response === 'DECLINED'
                    ? 'You said no'
                    : 'Closed'}
              </Badge>
            </div>
          ))}
        </section>
      )}
    </DonorShell>
  );
}
