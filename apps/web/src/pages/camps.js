'use client';

// Nearby camps (F10) — donor side.
//
// Defaults to the donor's own PIN code, because "is there one near me"
// is the actual question. Widening to everywhere is one tap, but it is
// not the default: a list dominated by camps an hour away is a list
// people stop opening.
//
// "I'll try to come" is deliberately soft everywhere it appears. A tap
// that reads as a promise is a tap people avoid making, and a loose
// signal many donors give is worth more than a firm one nobody does.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUpcomingCamps, toggleCampAttendance, toFormError } from '@rednexus/api';
import { client } from '@rednexus/api';
import DonorShell from '../components/layout/DonorShell.js';
import { useAuth } from '../context/AuthContext.js';
import { Card, Button, Alert, Spinner, Badge } from '../components/ui/index.js';

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

const daysAway = (d) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((new Date(d) - today) / 86400000);
};

export default function DonorCampsPage() {
  const { profile, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [nearbyOnly, setNearbyOnly] = useState(true);
  const [error, setError] = useState(null);

  const pincode = nearbyOnly ? profile?.areaPincode : undefined;

  const camps = useQuery({
    queryKey: ['camps', pincode ?? 'all'],
    queryFn: () => getUpcomingCamps({ pincode }),
  });

  const attending = useQuery({
    queryKey: ['camps-attending'],
    queryFn: () => client.get('/api/camps/mine-attending').then((r) => r.data),
    enabled: isAuthenticated && profile?.kind === 'DONOR',
  });

  const attendingIds = new Set(attending.data?.campIds ?? []);

  const toggle = useMutation({
    mutationFn: (id) => toggleCampAttendance(id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['camps-attending'] });
      queryClient.invalidateQueries({ queryKey: ['camps'] });
    },
    onError: (e) => setError(toFormError(e).message),
  });

  const list = camps.data?.camps ?? [];

  return (
    <DonorShell title="Blood donation camps">
      {profile?.areaPincode && (
        <div className="mb-lg flex flex-wrap gap-md">
          <Button
            variant={nearbyOnly ? 'primary' : 'secondary'}
            onClick={() => setNearbyOnly(true)}
          >
            Near me ({profile.areaPincode})
          </Button>
          <Button
            variant={nearbyOnly ? 'secondary' : 'primary'}
            onClick={() => setNearbyOnly(false)}
          >
            Everywhere
          </Button>
        </div>
      )}

      {error && (
        <div className="mb-lg">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {camps.isLoading && <Spinner label="Looking for camps" />}
      {camps.isError && <Alert tone="danger">Could not load camps.</Alert>}

      {camps.data && list.length === 0 && (
        <Card>
          <p className="text-sm text-ink-muted">
            {nearbyOnly
              ? 'No camps in your area right now. Try "Everywhere" to see others.'
              : 'No camps coming up right now. We will show them here when there are.'}
          </p>
        </Card>
      )}

      {list.map((camp) => {
        const going = attendingIds.has(camp.id);
        const days = daysAway(camp.date);

        return (
          <Card key={camp.id} className="mb-md">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="text-lg font-semibold">{camp.title}</p>
                <p className="text-sm text-ink-muted">{camp.bloodBank}</p>
              </div>
              {days === 0 ? (
                <Badge tone="danger">Today</Badge>
              ) : days === 1 ? (
                <Badge tone="warning">Tomorrow</Badge>
              ) : (
                <Badge tone="neutral">In {days} days</Badge>
              )}
            </div>

            <p className="mt-md text-sm">
              <strong>{formatDate(camp.date)}</strong>
              {camp.timeNote ? `, ${camp.timeNote}` : ''}
            </p>
            <p className="text-sm text-ink-muted">{camp.location}</p>
            {camp.notes && <p className="mt-xs text-sm text-ink-muted">{camp.notes}</p>}

            {isAuthenticated && profile?.kind === 'DONOR' && (
              <div className="mt-md flex flex-wrap items-center gap-md">
                <Button
                  variant={going ? 'secondary' : 'primary'}
                  onClick={() => toggle.mutate(camp.id)}
                  disabled={toggle.isPending}
                >
                  {going ? 'Change my mind' : "I'll try to come"}
                </Button>
                {going && (
                  <span className="text-sm text-success">
                    You said you hope to come.
                  </span>
                )}
              </div>
            )}

            {camp.interestedCount > 0 && (
              <p className="mt-sm text-xs text-ink-muted">
                {camp.interestedCount}{' '}
                {camp.interestedCount === 1 ? 'person hopes' : 'people hope'} to come
              </p>
            )}
          </Card>
        );
      })}

      <p className="mt-lg text-xs text-ink-muted">
        Saying you will try to come is not a commitment. Turn up if you can,
        and nothing happens if you cannot.
      </p>
    </DonorShell>
  );
}
