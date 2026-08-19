'use client';

// Donor management.
//
// Two jobs: clear people held after answering yes to "have you ever
// been advised not to donate blood?", and record a deferral from the
// paper form's page 4 Outcome field.
//
// The review queue shows no reason, because none was ever collected.
// That question routes a person to a conversation, not to a record -
// staff talk to them and decide. A "reason" column here would invite
// someone to type a medical fact into a system that has no business
// holding one.
//
// Search requires a term. Listing every donor with phone numbers on an
// empty query would turn a lookup tool into a bulk export.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getReviewQueue,
  clearDonorReview,
  updateDonorAsStaff,
  searchDonors,
  toFormError,
} from '@rednexus/api';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Button, Alert, Spinner, Badge } from '../../components/ui/index.js';

const STATUS_TONE = {
  ACTIVE: 'success',
  PROVISIONAL: 'info',
  PENDING_REVIEW: 'warning',
  PERMANENTLY_DEFERRED: 'neutral',
};

function ReviewRow({ donor, onDone }) {
  const [error, setError] = useState(null);

  const clear = useMutation({
    mutationFn: () => clearDonorReview(donor.id),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  const defer = useMutation({
    mutationFn: () => updateDonorAsStaff(donor.id, { deferralType: 'PERMANENT' }),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  return (
    <Card className="mb-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-semibold">{donor.name}</p>
          <p className="text-sm text-ink-muted">
            {donor.phone} · {donor.bloodGroup} · PIN {donor.areaPincode}
          </p>
          <p className="mt-xs text-xs text-ink-muted">
            Registered{' '}
            {new Date(donor.registeredAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            {donor.registeredAtCampId ? ` at ${donor.registeredAtCampId}` : ''}
          </p>
        </div>
        <Badge tone="warning">Waiting for review</Badge>
      </div>

      <p className="mt-md rounded-md bg-canvas p-md text-sm text-ink-muted">
        This person said someone has advised them not to donate. Speak to them
        before deciding. The app did not ask why and holds no medical details.
      </p>

      <div className="mt-md flex flex-wrap gap-md">
        <Button onClick={() => clear.mutate()} disabled={clear.isPending}>
          {clear.isPending ? 'Saving…' : 'Cleared to donate'}
        </Button>
        <Button variant="secondary" onClick={() => defer.mutate()} disabled={defer.isPending}>
          Should not donate
        </Button>
      </div>

      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </Card>
  );
}

function DeferralControl({ donor, onDone }) {
  const [until, setUntil] = useState('');
  const [error, setError] = useState(null);

  const save = useMutation({
    mutationFn: (data) => updateDonorAsStaff(donor.id, data),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  return (
    <div className="mt-md border-t border-black/5 pt-md">
      <p className="mb-sm text-xs font-medium uppercase tracking-wide text-ink-muted">
        Record a deferral
      </p>
      <div className="flex flex-wrap items-end gap-md">
        <label className="text-sm">
          <span className="mb-xs block">Cannot donate until</span>
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="rounded-md border border-black/15 px-sm py-xs"
          />
        </label>
        <Button
          variant="secondary"
          disabled={!until || save.isPending}
          onClick={() => save.mutate({ deferralType: 'TEMPORARY', deferralUntilDate: until })}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          disabled={save.isPending}
          onClick={() => save.mutate({ deferralType: 'PERMANENT' })}
        >
          Permanent
        </Button>
      </div>
      <p className="mt-xs text-xs text-ink-muted">
        This date overrides the usual gap between donations. The reason stays on
        the paper form.
      </p>
      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </div>
  );
}

export default function DonorManagementPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState({ phone: '', pincode: '' });
  const [submitted, setSubmitted] = useState(null);

  const queue = useQuery({ queryKey: ['review-queue'], queryFn: getReviewQueue });

  const results = useQuery({
    queryKey: ['donor-search', submitted],
    queryFn: () => searchDonors(submitted),
    enabled: Boolean(submitted),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['donor-search'] });
  };

  const canSearch = term.phone.trim() || term.pincode.trim();

  return (
    <DashboardShell
      title="Donors"
      subtitle="Review people held after registration, and record deferrals."
    >
      <section className="mb-xl">
        <h2 className="mb-md text-lg font-semibold">
          Waiting for review ({queue.data?.donors.length ?? 0})
        </h2>

        {queue.isLoading && <Spinner label="Loading review queue" />}
        {queue.isError && <Alert tone="danger">Could not load the review queue.</Alert>}

        {queue.data &&
          (queue.data.donors.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">
                Nobody is waiting. People appear here when they say someone has
                advised them not to donate.
              </p>
            </Card>
          ) : (
            queue.data.donors.map((d) => (
              <ReviewRow key={d.id} donor={d} onDone={refresh} />
            ))
          ))}
      </section>

      <section>
        <h2 className="mb-md text-lg font-semibold">Find a donor</h2>

        <Card className="mb-md">
          <form
            className="flex flex-wrap items-end gap-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSearch) setSubmitted({ ...term });
            }}
          >
            <label className="text-sm">
              <span className="mb-xs block font-medium">Phone number</span>
              <input
                value={term.phone}
                onChange={(e) => setTerm({ ...term, phone: e.target.value })}
                className="rounded-md border border-black/15 px-sm py-xs"
              />
            </label>
            <label className="text-sm">
              <span className="mb-xs block font-medium">or PIN code</span>
              <input
                value={term.pincode}
                onChange={(e) => setTerm({ ...term, pincode: e.target.value })}
                className="rounded-md border border-black/15 px-sm py-xs"
              />
            </label>
            <Button type="submit" disabled={!canSearch}>
              Search
            </Button>
          </form>
          <p className="mt-sm text-xs text-ink-muted">
            Enter a phone number or PIN code. There is no way to list every donor.
          </p>
        </Card>

        {results.isLoading && <Spinner label="Searching" />}
        {results.isError && <Alert tone="danger">{toFormError(results.error).message}</Alert>}

        {results.data &&
          (results.data.donors.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">Nobody matched that search.</p>
            </Card>
          ) : (
            results.data.donors.map((d) => (
              <Card key={d.id} className="mb-md">
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div>
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-sm text-ink-muted">
                      {d.phone} · PIN {d.areaPincode}
                    </p>
                    <p className="mt-xs text-sm">
                      <strong className="text-primary">
                        {d.bloodGroupVerified ?? d.bloodGroup}
                      </strong>{' '}
                      {d.bloodGroupVerified ? '(tested)' : '(as told to us)'}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={STATUS_TONE[d.status]}>{d.status.replace(/_/g, ' ')}</Badge>
                    <p className="mt-xs text-xs text-ink-muted">
                      {d.eligible
                        ? 'Can donate now'
                        : d.eligibleFrom
                          ? `From ${new Date(d.eligibleFrom).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}`
                          : 'Not available'}
                    </p>
                  </div>
                </div>

                {d.status !== 'PERMANENTLY_DEFERRED' && (
                  <DeferralControl donor={d} onDone={refresh} />
                )}
              </Card>
            ))
          ))}
      </section>
    </DashboardShell>
  );
}
