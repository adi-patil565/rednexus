'use client';

// Platform admin panel.
//
// A separate surface with a separate login, because it answers a
// different question. An admin decides WHICH blood banks exist on the
// platform; a blood bank's own staff decide what that blood bank does.
// There is nothing here for confirming a threshold or approving an
// alert - not hidden, absent, because the API has no such endpoint for
// an admin.
//
// The verify button refuses when an institution has no staff account.
// That is not paperwork: every threshold confirmation and every alert
// approval has to be attributable to a named person, so verifying a
// blood bank with nobody to do that would create one that can never
// legally act.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getInstitutions,
  getPlatformStats,
  decideInstitution,
  toFormError,
} from '@rednexus/api';
import { useAuth } from '../../context/AuthContext.js';
import { Card, Button, Alert, Spinner, Badge } from '../../components/ui/index.js';

const STATUS_TONE = {
  VERIFIED: 'success',
  UNVERIFIED: 'warning',
  PENDING: 'warning',
  REJECTED: 'neutral',
};

function InstitutionCard({ institution, onDone }) {
  const [error, setError] = useState(null);

  const decide = useMutation({
    mutationFn: (decision) => decideInstitution(institution.id, decision),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  const hasStaff = institution.staffCount > 0;
  const pending = institution.verificationStatus === 'UNVERIFIED';

  return (
    <Card className="mb-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="text-lg font-semibold">{institution.name}</p>
          <p className="text-sm text-ink-muted">
            {institution.category === 'IN_HOUSE'
              ? `Inside ${institution.linkedHospitalName ?? 'a hospital'}`
              : 'Standalone, serves several hospitals'}
          </p>
          <p className="mt-xs text-sm text-ink-muted">
            {institution.address ?? `PIN ${institution.pincode}`}
          </p>
        </div>
        <Badge tone={STATUS_TONE[institution.verificationStatus]}>
          {institution.verificationStatus}
        </Badge>
      </div>

      <p className="mt-md text-sm">
        {hasStaff ? (
          <>
            {institution.staffCount} staff{' '}
            {institution.staffCount === 1 ? 'account' : 'accounts'}
          </>
        ) : (
          <span className="text-danger">No staff account yet</span>
        )}
      </p>

      {!hasStaff && pending && (
        <div className="mt-md">
          <Alert tone="warning">
            This blood bank cannot be verified until someone there has an
            account. Confirming thresholds and approving alerts have to be
            recorded against a named person.
          </Alert>
        </div>
      )}

      {institution.verifiedAt && (
        <p className="mt-sm text-xs text-ink-muted">
          {institution.verificationStatus === 'VERIFIED' ? 'Verified' : 'Reviewed'} by{' '}
          {institution.verifiedBy ?? 'an administrator'} on{' '}
          {new Date(institution.verifiedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </p>
      )}

      {pending && (
        <div className="mt-md flex gap-md">
          <Button onClick={() => decide.mutate('VERIFIED')} disabled={decide.isPending || !hasStaff}>
            {decide.isPending ? 'Saving…' : 'Verify'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => decide.mutate('REJECTED')}
            disabled={decide.isPending}
          >
            Reject
          </Button>
        </div>
      )}

      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </Card>
  );
}

export default function AdminPage() {
  const { isLoading, isAuthenticated, profile, logout } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = profile?.kind === 'ADMIN';

  const institutions = useQuery({
    queryKey: ['admin-institutions'],
    queryFn: () => getInstitutions(),
    enabled: isAdmin,
  });

  const stats = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getPlatformStats,
    enabled: isAdmin,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-institutions'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="mx-auto max-w-md p-xl">
        <Alert tone="warning" title="Administrators only">
          This page is for platform administrators.
          {isAuthenticated && (
            <div className="mt-md">
              <Button variant="secondary" onClick={logout}>Sign out</Button>
            </div>
          )}
        </Alert>
      </div>
    );
  }

  const list = institutions.data?.institutions ?? [];
  const awaiting = list.filter((i) => i.verificationStatus === 'UNVERIFIED');
  const decided = list.filter((i) => i.verificationStatus !== 'UNVERIFIED');

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-lg py-md">
          <div>
            <p className="text-lg font-bold text-primary">Raktasetu</p>
            <p className="text-xs text-ink-muted">Platform administration</p>
          </div>
          <div className="flex items-center gap-md">
            <span className="text-sm text-ink-muted">{profile.name}</span>
            <Button variant="ghost" onClick={logout}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-lg py-xl">
        {stats.data && (
          <div className="mb-xl grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Blood banks', stats.data.institutions.total],
              ['Verified', stats.data.institutions.verified],
              ['Donors', stats.data.donors.total],
              ['Usage reports', stats.data.usageRecords],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-xxl font-bold text-primary">{value}</p>
                <p className="text-xs text-ink-muted">{label}</p>
              </Card>
            ))}
          </div>
        )}

        {institutions.isLoading && <Spinner label="Loading blood banks" />}
        {institutions.isError && <Alert tone="danger">Could not load blood banks.</Alert>}

        <section className="mb-xl">
          <h2 className="mb-md text-lg font-semibold">
            Waiting for review ({awaiting.length})
          </h2>
          {awaiting.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">Nothing waiting.</p>
            </Card>
          ) : (
            awaiting.map((i) => (
              <InstitutionCard key={i.id} institution={i} onDone={refresh} />
            ))
          )}
        </section>

        {decided.length > 0 && (
          <section>
            <h2 className="mb-md text-lg font-semibold">
              Reviewed ({decided.length})
            </h2>
            {decided.map((i) => (
              <InstitutionCard key={i.id} institution={i} onDone={refresh} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
