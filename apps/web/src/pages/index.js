'use client';

// Donor home.
//
// Two things, in this order:
//   1. Any request waiting for an answer, at the very top.
//   2. Whether they can donate right now, and if not, when.
//
// Deliberately absent from an alert: who the blood is for. Rules
// section 1 forbids a donor-to-patient channel, and naming the patient
// would create one out of a notification. The donor is told what is
// needed and which blood bank asked - enough to decide, and nothing
// that lets them bypass the institution.

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyAlerts, respondToRequest, toFormError } from '@rednexus/api';
import DonorShell from '../components/layout/DonorShell.js';
import { useAuth } from '../context/AuthContext.js';
import { Card, Button, Alert, Spinner, Badge } from '../components/ui/index.js';

function AlertCard({ alert, onDone }) {
  const [error, setError] = useState(null);

  const answer = useMutation({
    mutationFn: (accept) => respondToRequest(alert.requestId, accept),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  return (
    <Card className="mb-md border-l-4 border-l-primary">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <p className="text-lg font-semibold">
          <span className="text-xxl font-bold text-primary">{alert.bloodGroup}</span> blood
          is needed
        </p>
        {alert.urgent && <Badge tone="danger">Needed urgently</Badge>}
      </div>

      <p className="mt-sm text-sm text-ink-muted">
        {alert.bloodBank} needs {alert.unitsNeeded}{' '}
        {alert.unitsNeeded === 1 ? 'unit' : 'units'}. They are in area {alert.area}.
      </p>

      <div className="mt-lg flex gap-md">
        <Button onClick={() => answer.mutate(true)} disabled={answer.isPending}>
          {answer.isPending ? 'Sending…' : 'Yes, I can donate'}
        </Button>
        <Button variant="secondary" onClick={() => answer.mutate(false)} disabled={answer.isPending}>
          Not this time
        </Button>
      </div>

      <p className="mt-sm text-xs text-ink-muted">
        Saying yes shares your name and phone number with this blood bank so
        they can arrange a time. Nobody else sees them.
      </p>

      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </Card>
  );
}

export default function DonorHome() {
  const { profile, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

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
      {/* Anything needing an answer comes first, before status. */}
      {open.length > 0 && (
        <section className="mb-xl">
          <h2 className="mb-md text-lg font-semibold">
            {open.length === 1 ? 'Someone needs blood' : `${open.length} requests need an answer`}
          </h2>
          {open.map((a) => (
            <AlertCard key={a.requestId} alert={a} onDone={refresh} />
          ))}
        </section>
      )}

      {profile?.kind === 'DONOR' && (
        <Card className="mb-lg">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-sm text-ink-muted">Your blood group</p>
              <p className="text-xxl font-bold text-primary">
                {profile.bloodGroupVerified ?? profile.bloodGroup}
              </p>
              {!profile.bloodGroupVerified && (
                <p className="text-xs text-ink-muted">
                  As you told us. The blood bank confirms this when you donate.
                </p>
              )}
            </div>
            <Badge tone={profile.eligible ? 'success' : 'neutral'}>
              {profile.eligible ? 'You can donate' : 'Not just now'}
            </Badge>
          </div>

          {/* Plain language, no product vocabulary. */}
          <p className="mt-md text-sm">{profile.eligibilityMessage}</p>

          {profile.status === 'PENDING_REVIEW' && (
            <div className="mt-md">
              <Alert tone="info">
                Blood bank staff are checking your details. You will not be asked
                to donate until that is done.
              </Alert>
            </div>
          )}

          {profile.notificationsPaused && (
            <div className="mt-md">
              <Alert tone="warning">
                You have paused requests, so we will not contact you.{' '}
                <Link className="font-semibold text-primary underline" href="/preferences">
                  Turn them back on
                </Link>
              </Alert>
            </div>
          )}
        </Card>
      )}

      {alertsLoading && <Spinner label="Checking for requests" />}

      {!alertsLoading && open.length === 0 && (
        <Card>
          <p className="text-sm text-ink-muted">
            Nothing needs your answer right now. We will let you know when blood
            of your group is needed nearby.
          </p>
        </Card>
      )}

      {answered.length > 0 && (
        <section className="mt-xl">
          <h2 className="mb-md text-lg font-semibold">Earlier requests</h2>
          {answered.slice(0, 8).map((a) => (
            <Card key={a.requestId} className="mb-sm">
              <div className="flex items-center justify-between text-sm">
                <span>
                  <strong className="text-primary">{a.bloodGroup}</strong> · {a.bloodBank}
                </span>
                <Badge tone={a.response === 'ACCEPTED' ? 'success' : 'neutral'}>
                  {a.response === 'ACCEPTED'
                    ? 'You said yes'
                    : a.response === 'DECLINED'
                      ? 'You said no'
                      : 'Closed'}
                </Badge>
              </div>
            </Card>
          ))}
        </section>
      )}
    </DonorShell>
  );
}
