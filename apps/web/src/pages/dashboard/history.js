'use client';

// Confirmation history.
//
// Architecture.md section 3 requires that every threshold confirmation
// and every DETECTED -> RAISED transition record who did it and when,
// because that record is "the evidence the human-in-the-loop guarantee
// is real, not just a UI label".
//
// Enforcing the guarantee and being able to SHOW it are different
// things, and a promise nobody can audit is a promise on trust. This
// screen is the second one. It is read-only by construction - there is
// no endpoint to edit or remove an entry, which is what makes it worth
// anything.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { client } from '@rednexus/api';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Alert, Spinner, Badge } from '../../components/ui/index.js';

const formatWhen = (d) =>
  new Date(d).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const ORIGIN_LABEL = {
  THRESHOLD_BREACH: 'Stock fell low',
  SCHEDULED: 'Regular transfusion',
  MANUAL: 'Raised by staff',
};

export default function HistoryPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['history'],
    queryFn: () => client.get('/api/history').then((r) => r.data),
  });

  const entries = data?.entries ?? [];

  return (
    <DashboardShell
      title="History"
      subtitle="Every threshold and every alert your blood bank has approved, and who approved it."
    >
      {isLoading && <Spinner label="Loading history" />}
      {isError && <Alert tone="danger">Could not load history.</Alert>}

      {data && entries.length === 0 && (
        <Card>
          <p className="text-sm text-ink-muted">
            Nothing confirmed yet. Thresholds you approve and alerts you send
            will be recorded here.
          </p>
        </Card>
      )}

      {entries.map((entry, i) => (
        <Card key={`${entry.kind}-${entry.at}-${i}`} className="mb-sm">
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-sm">
                <Badge tone={entry.kind === 'THRESHOLD' ? 'info' : 'success'}>
                  {entry.kind === 'THRESHOLD' ? 'Threshold' : 'Alert'}
                </Badge>
                {entry.origin && (
                  <span className="text-xs text-ink-muted">{ORIGIN_LABEL[entry.origin]}</span>
                )}
                {entry.adjusted && (
                  <Badge tone="warning">Changed from the suggestion</Badge>
                )}
              </div>

              <p className="mt-sm text-sm">{entry.summary}</p>

              {entry.basis && (
                <p className="mt-xs text-xs text-ink-muted">{entry.basis}</p>
              )}
            </div>

            <div className="text-right text-xs text-ink-muted">
              <p className="font-medium text-ink">{entry.by}</p>
              <p>{formatWhen(entry.at)}</p>
            </div>
          </div>
        </Card>
      ))}

      {entries.length > 0 && (
        <p className="mt-lg text-xs text-ink-muted">
          This record cannot be edited or deleted. It exists so the decisions
          made in your blood bank&rsquo;s name can always be traced to the person
          who made them.
        </p>
      )}
    </DashboardShell>
  );
}
