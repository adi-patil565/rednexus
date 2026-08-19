'use client';

// Threshold confirmation (T3) — the most important screen in the product.
//
// PRD section 10 names the failure mode precisely: "Human confirmation
// must never become a rubber-stamp bottleneck. If confirming a
// threshold or alert is slow or confusing, staff will stop doing it
// carefully, which defeats the purpose of the human-in-the-loop design."
//
// Three decisions follow from that, and all three are deliberate:
//
//   1. NO "confirm all" button. Not an oversight - the API has no such
//      endpoint either. One button approving eight numbers is exactly
//      how a gate becomes a formality (Rules section 1).
//
//   2. The basis sentence is shown next to every number, not hidden
//      behind a tooltip or an expander. "Average 19.6 units/day over 28
//      days" is what makes approving a judgement instead of a reflex.
//
//   3. The number is an editable input, pre-filled with the proposal.
//      The proposal is advice. If it looks wrong to the person who
//      actually runs the blood bank, theirs wins, and the API records
//      that it was edited.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getThresholds, confirmThreshold, toFormError } from '@rednexus/api';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Button, Alert, Spinner, Badge } from '../../components/ui/index.js';

const CONFIDENCE_TONE = { HIGH: 'success', MEDIUM: 'warning', LOW: 'danger' };
const CONFIDENCE_TEXT = {
  HIGH: 'Based on plenty of data',
  MEDIUM: 'Based on some data',
  LOW: 'Based on very little data — check this carefully',
};

function ThresholdRow({ item, onConfirmed }) {
  const proposed = item.proposed;
  const active = item.active;

  const [threshold, setThreshold] = useState(
    String(active?.threshold ?? proposed.threshold)
  );
  const [target, setTarget] = useState(
    String(active?.weeklyCollectionTarget ?? proposed.weeklyCollectionTarget)
  );
  const [error, setError] = useState(null);

  const mutation = useMutation({
    mutationFn: () =>
      confirmThreshold(item.bloodGroupValue, {
        confirmedThreshold: Number(threshold),
        confirmedCollectionTarget: Number(target),
      }),
    onSuccess: () => {
      setError(null);
      onConfirmed();
    },
    onError: (e) => setError(toFormError(e).message),
  });

  const edited =
    Number(threshold) !== proposed.threshold ||
    Number(target) !== proposed.weeklyCollectionTarget;

  return (
    <Card className="mb-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="flex items-baseline gap-md">
          <span className="text-xxl font-bold text-primary">{item.bloodGroup}</span>
          {active ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="warning">Not confirmed</Badge>
          )}
          <Badge tone={CONFIDENCE_TONE[proposed.confidence]}>
            {CONFIDENCE_TEXT[proposed.confidence]}
          </Badge>
        </div>

        {active && (
          <p className="text-xs text-ink-muted">
            Confirmed by {active.confirmedBy ?? 'a staff member'} on{' '}
            {new Date(active.confirmedAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            {active.wasEdited && ' · adjusted from the suggestion'}
          </p>
        )}
      </div>

      {/* The basis. Shown, never hidden — this is what stops the
          approve button from becoming a reflex. */}
      <p className="mt-md rounded-md bg-canvas p-md text-sm text-ink-muted">
        {proposed.basis}
      </p>

      <div className="mt-md flex flex-wrap items-end gap-lg">
        <label className="text-sm">
          <span className="mb-xs block font-medium">Minimum stock to hold</span>
          <div className="flex items-center gap-sm">
            <input
              type="number"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-24 rounded-md border border-black/15 px-sm py-xs text-right focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-ink-muted">
              units (suggested {proposed.threshold})
            </span>
          </div>
        </label>

        <label className="text-sm">
          <span className="mb-xs block font-medium">Collect each week</span>
          <div className="flex items-center gap-sm">
            <input
              type="number"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-24 rounded-md border border-black/15 px-sm py-xs text-right focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-ink-muted">
              units (suggested {proposed.weeklyCollectionTarget})
            </span>
          </div>
        </label>

        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending
            ? 'Saving…'
            : active
              ? 'Update'
              : `Confirm ${item.bloodGroup}`}
        </Button>

        {edited && (
          <span className="text-xs text-secondary">
            You changed the suggestion — that will be recorded.
          </span>
        )}
      </div>

      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </Card>
  );
}

export default function ThresholdsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['thresholds'],
    queryFn: () => getThresholds(28),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['thresholds'] });

  const pending = data?.thresholds.filter((t) => t.needsConfirmation) ?? [];
  const confirmed = data?.thresholds.filter((t) => !t.needsConfirmation) ?? [];

  return (
    <DashboardShell
      title="Thresholds and collection targets"
      subtitle="Suggested from your reported usage. Nothing takes effect until you confirm it."
    >
      {isLoading && <Spinner label="Working out suggestions from your usage" />}
      {isError && <Alert tone="danger">Could not load thresholds.</Alert>}

      {data && (
        <>
          <div className="mb-lg">
            <Alert tone="info" title="How this works">
              These numbers are suggestions worked out from the units you have
              reported issuing. They do nothing until you confirm them, and you
              can change any number before you do. Each blood group is confirmed
              on its own.
            </Alert>
          </div>

          {pending.length > 0 && (
            <section className="mb-xl">
              <h2 className="mb-md text-lg font-semibold">
                Waiting for you ({pending.length})
              </h2>
              {pending.map((item) => (
                <ThresholdRow key={item.bloodGroupValue} item={item} onConfirmed={refresh} />
              ))}
            </section>
          )}

          {confirmed.length > 0 && (
            <section>
              <h2 className="mb-md text-lg font-semibold">
                Active ({confirmed.length})
              </h2>
              {confirmed.map((item) => (
                <ThresholdRow key={item.bloodGroupValue} item={item} onConfirmed={refresh} />
              ))}
            </section>
          )}

          {pending.length === 0 && confirmed.length === 0 && (
            <Alert tone="info">
              No suggestions yet. Report a few days of usage first.
            </Alert>
          )}
        </>
      )}
    </DashboardShell>
  );
}
