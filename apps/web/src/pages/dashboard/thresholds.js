'use client';

// Threshold confirmation — the most important screen in the product.
//
// PRD section 10 names the failure mode: "Human confirmation must never
// become a rubber-stamp bottleneck. If confirming a threshold or alert
// is slow or confusing, staff will stop doing it carefully, which
// defeats the purpose of the human-in-the-loop design."
//
// The design answer is to make the REASONING the largest thing on the
// row, not the button. Each blood group is a ruled editorial entry: the
// group in display serif, the basis sentence set as body copy at full
// measure, and the controls last. You read past the evidence to reach
// the control.
//
// There is deliberately no "confirm all". Not an omission — the API has
// no bulk endpoint either. One button approving eight numbers is how a
// gate becomes a formality.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getThresholds, confirmThreshold, toFormError } from '@rednexus/api';
import DashboardShell from '../../components/layout/DashboardShell.js';
import {
  Panel,
  Section,
  Note,
  Spinner,
  Badge,
  Button,
  Label,
  BloodGroup,
} from '../../components/ui/index.js';

const CONFIDENCE = {
  HIGH: { tone: 'success', text: 'Plenty of data' },
  MEDIUM: { tone: 'warning', text: 'Some data' },
  LOW: { tone: 'danger', text: 'Very little data — check carefully' },
};

function ThresholdRow({ item, onConfirmed }) {
  const { proposed, active } = item;
  const [threshold, setThreshold] = useState(String(active?.threshold ?? proposed.threshold));
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

  const conf = CONFIDENCE[proposed.confidence];

  return (
    <article className="rule-top py-xl">
      <div className="grid gap-lg md:grid-cols-swiss">
        {/* --- Identity --- */}
        <header className="md:col-span-2">
          <BloodGroup size="lg">{item.bloodGroup}</BloodGroup>
          <div className="mt-md">
            {active ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Not set</Badge>}
          </div>
        </header>

        {/* --- The evidence, given the most space --- */}
        <div className="md:col-span-6">
          <Label className="block">Why this number</Label>
          <p className="mt-sm max-w-measure text-base leading-relaxed text-ink">
            {proposed.basis}
          </p>

          <div className="mt-lg flex flex-wrap items-center gap-md">
            <Badge tone={conf.tone}>{conf.text}</Badge>
            <span className="font-mono text-tiny text-ink-faint">
              {proposed.meanDailyUsage}/day average
            </span>
          </div>

          {active && (
            <p className="mt-md text-tiny text-ink-faint">
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

        {/* --- The controls, last --- */}
        <div className="md:col-span-4">
          <div className="grid grid-cols-2 gap-md">
            <label className="block">
              <Label className="mb-xs block">Hold at least</Label>
              <input
                type="number"
                min="0"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="field-num"
              />
              <span className="mt-xs block text-tiny text-ink-faint">
                units · suggested {proposed.threshold}
              </span>
            </label>

            <label className="block">
              <Label className="mb-xs block">Collect weekly</Label>
              <input
                type="number"
                min="0"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="field-num"
              />
              <span className="mt-xs block text-tiny text-ink-faint">
                units · suggested {proposed.weeklyCollectionTarget}
              </span>
            </label>
          </div>

          <Button
            className="mt-lg w-full"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : active ? 'Update' : `Confirm ${item.bloodGroup}`}
          </Button>

          {edited && (
            <p className="mt-sm text-tiny text-blood">
              You changed the suggestion — that will be recorded.
            </p>
          )}
          {error && <p className="mt-sm text-tiny text-blood">{error}</p>}
        </div>
      </div>
    </article>
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
      title="Minimums and targets"
      standfirst="Worked out from the units you have reported issuing. Nothing takes effect until you confirm it, and you can change any number first."
      aside={
        <Note tone="info" title="Each group on its own">
          Blood groups are confirmed one at a time, on purpose. A single button
          approving eight numbers is a button nobody reads.
        </Note>
      }
    >
      {isLoading && <Spinner label="Working out suggestions from your usage" />}
      {isError && <Note tone="danger">Could not load thresholds.</Note>}

      {data && (
        <>
          {pending.length > 0 && (
            <Section index={1} title="Waiting for you" aside={`${pending.length} groups`}>
              <div>
                {pending.map((item) => (
                  <ThresholdRow key={item.bloodGroupValue} item={item} onConfirmed={refresh} />
                ))}
              </div>
            </Section>
          )}

          {confirmed.length > 0 && (
            <Section
              index={pending.length > 0 ? 2 : 1}
              title="Active"
              aside={`${confirmed.length} groups`}
              className="mt-3xl"
            >
              <div>
                {confirmed.map((item) => (
                  <ThresholdRow key={item.bloodGroupValue} item={item} onConfirmed={refresh} />
                ))}
              </div>
            </Section>
          )}

          {pending.length === 0 && confirmed.length === 0 && (
            <Panel>
              <p className="text-base text-ink-muted">
                No suggestions yet. Report a few days of usage first.
              </p>
            </Panel>
          )}
        </>
      )}
    </DashboardShell>
  );
}
