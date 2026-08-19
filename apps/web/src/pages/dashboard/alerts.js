'use client';

// Alerts and requests — the second-highest-stakes screen in the product.
//
// Everything drafted by the system sits here doing nothing until a
// named staff member approves it. The design assumes the reviewer is
// busy and has seen this screen a hundred times, which is exactly when
// a gate degrades into a formality (PRD section 10).
//
// So, deliberately:
//
//   NO "approve all" button. Not an omission - the API has no bulk
//   endpoint, and a client-side loop over the single one would recreate
//   the shortcut Rules section 1 forbids. Each alert is approved on its
//   own, by someone who read it.
//
//   Approving and notifying are TWO separate actions. Approval says
//   "this need is real"; notifying says "contact donors now". Merging
//   them would mean one click both decides and dispatches, and there
//   would be no moment left in which a mistake could be caught.
//
//   The reason the system drafted it is shown in full, with the stock
//   and threshold numbers as they were at detection - not as they are
//   now, which may have moved.

import React, { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getRequests,
  detectBreaches,
  confirmRequest,
  notifyDonors,
  transitionRequest,
  raiseManualRequest,
  toFormError,
} from '@rednexus/api';
import { BLOOD_GROUPS, BLOOD_GROUP_LABELS } from '@rednexus/types';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Button, Alert, Spinner, Badge } from '../../components/ui/index.js';

const ORIGIN_LABEL = {
  THRESHOLD_BREACH: 'Stock fell below your minimum',
  SCHEDULED: 'Collection target off pace',
  MANUAL: 'Raised by staff',
};

const STATE_TONE = {
  DETECTED: 'warning',
  RAISED: 'info',
  NOTIFIED: 'info',
  ACCEPTED: 'success',
  CONFIRMED: 'success',
  ARRIVED: 'success',
  DONATED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

const STATE_LABEL = {
  DETECTED: 'Waiting for your approval',
  RAISED: 'Approved — no one contacted yet',
  NOTIFIED: 'Donors contacted',
  ACCEPTED: 'Donors accepted',
  CONFIRMED: 'Donors confirmed',
  ARRIVED: 'Donor arrived',
  DONATED: 'Donated',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

// ------------------------------------------------------------------
// A drafted alert awaiting approval.
// ------------------------------------------------------------------
function DraftCard({ item, onDone }) {
  const [units, setUnits] = useState(String(item.unitsNeeded));
  const [urgent, setUrgent] = useState(item.urgent);
  const [error, setError] = useState(null);

  const approve = useMutation({
    mutationFn: () => confirmRequest(item.id, { unitsNeeded: Number(units), urgent }),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  const cancel = useMutation({
    mutationFn: () => transitionRequest(item.id, 'CANCELLED'),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  return (
    <Card className="mb-md border-l-4 border-l-caution">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="flex items-baseline gap-md">
          <span className="text-h3 font-bold text-blood">{item.bloodGroup}</span>
          <Badge tone="warning">Waiting for your approval</Badge>
          {item.urgent && <Badge tone="danger">Urgent</Badge>}
        </div>
        <span className="text-tiny text-ink-muted">{ORIGIN_LABEL[item.origin]}</span>
      </div>

      {/* Why the system drafted this. Shown in full, never truncated:
          an alert with no visible reason is one that gets approved
          without being read. */}
      <p className="mt-md rounded-md bg-paper p-md text-small text-ink-muted">
        {item.basis}
      </p>

      {item.stockAtDetection != null && (
        <p className="mt-sm text-tiny text-ink-muted">
          At the time this was drafted: {item.stockAtDetection} units in stock,
          minimum {item.thresholdAtDetection}.
        </p>
      )}

      <div className="mt-md flex flex-wrap items-end gap-lg">
        <label className="text-small">
          <span className="mb-xs block font-medium">Units to ask for</span>
          <input
            type="number"
            min="1"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            className="w-24 rounded-md border border-rule px-sm py-xs text-right focus:border-blood focus:outline-none"
          />
        </label>

        <label className="flex items-center gap-sm text-small">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Mark urgent
        </label>

        <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
          {approve.isPending ? 'Approving…' : `Approve ${item.bloodGroup}`}
        </Button>

        <Button variant="secondary" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          Not needed
        </Button>
      </div>

      <p className="mt-sm text-tiny text-ink-muted">
        Approving does not contact anyone yet — you choose when to send.
      </p>

      {error && <p className="mt-sm text-small text-blood">{error}</p>}
    </Card>
  );
}

// ------------------------------------------------------------------
// An approved request, live.
// ------------------------------------------------------------------
function ActiveCard({ item, onDone }) {
  const [error, setError] = useState(null);

  const notify = useMutation({
    mutationFn: () => notifyDonors(item.id),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  const close = useMutation({
    mutationFn: () => transitionRequest(item.id, 'CANCELLED'),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  const canNotify = item.state === 'RAISED' || item.state === 'NOTIFIED';

  return (
    <Card className="mb-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="flex items-baseline gap-md">
          <span className="text-h4 font-bold text-blood">{item.bloodGroup}</span>
          <span className="text-small text-ink-muted">{item.unitsNeeded} units</span>
          <Badge tone={STATE_TONE[item.state]}>{STATE_LABEL[item.state]}</Badge>
          {item.urgent && <Badge tone="danger">Urgent</Badge>}
        </div>
        <Link
          href={`/dashboard/requests/${item.id}`}
          className="text-small font-semibold text-blood underline"
        >
          View details
        </Link>
      </div>

      <p className="mt-sm text-tiny text-ink-muted">
        Approved by {item.confirmedBy ?? 'staff'}
        {item.confirmedAt &&
          ` on ${new Date(item.confirmedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          })}`}
        {item.stageLevel > 0 && ` · ${item.notified} contacted · ${item.accepted} accepted`}
      </p>

      <div className="mt-md flex flex-wrap gap-md">
        {canNotify && (
          <Button onClick={() => notify.mutate()} disabled={notify.isPending}>
            {notify.isPending
              ? 'Contacting…'
              : item.stageLevel === 0
                ? 'Contact donors'
                : 'Contact more donors'}
          </Button>
        )}
        <Button variant="secondary" onClick={() => close.mutate()} disabled={close.isPending}>
          Cancel request
        </Button>
      </div>

      {item.stageLevel > 0 && (
        <p className="mt-sm text-tiny text-ink-muted">
          Round {item.stageLevel}. Contacting more widens the pool — no one
          already asked is contacted again.
        </p>
      )}

      {error && <p className="mt-sm text-small text-blood">{error}</p>}
    </Card>
  );
}

// ------------------------------------------------------------------
// Raise a request directly.
// ------------------------------------------------------------------
function ManualRequestForm({ onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    bloodGroup: 'O_POS',
    unitsNeeded: '2',
    urgent: true,
    reason: '',
  });
  const [error, setError] = useState(null);

  const raise = useMutation({
    mutationFn: () =>
      raiseManualRequest({
        bloodGroup: form.bloodGroup,
        unitsNeeded: Number(form.unitsNeeded),
        urgent: form.urgent,
        reason: form.reason,
      }),
    onSuccess: () => {
      setOpen(false);
      setForm((f) => ({ ...f, reason: '' }));
      onDone();
    },
    onError: (e) => setError(toFormError(e).message),
  });

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Raise a request now
      </Button>
    );
  }

  return (
    <Card>
      <h3 className="mb-md font-semibold">Raise a request</h3>
      <p className="mb-md text-small text-ink-muted">
        For an emergency the system has not picked up. This is approved the
        moment you raise it, because you are raising it.
      </p>

      <div className="flex flex-wrap items-end gap-md">
        <label className="text-small">
          <span className="mb-xs block font-medium">Blood group</span>
          <select
            value={form.bloodGroup}
            onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
            className="rounded-md border border-rule px-sm py-xs"
          >
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {BLOOD_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-small">
          <span className="mb-xs block font-medium">Units</span>
          <input
            type="number"
            min="1"
            value={form.unitsNeeded}
            onChange={(e) => setForm({ ...form, unitsNeeded: e.target.value })}
            className="w-20 rounded-md border border-rule px-sm py-xs text-right"
          />
        </label>

        <label className="flex items-center gap-sm text-small">
          <input
            type="checkbox"
            checked={form.urgent}
            onChange={(e) => setForm({ ...form, urgent: e.target.checked })}
          />
          Urgent
        </label>
      </div>

      <label className="mt-md block text-small">
        <span className="mb-xs block font-medium">Reason</span>
        <input
          type="text"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Road accident, theatre 2"
          className="w-full rounded-md border border-rule px-sm py-xs"
        />
      </label>

      <div className="mt-md flex gap-md">
        <Button onClick={() => raise.mutate()} disabled={raise.isPending || !form.reason.trim()}>
          {raise.isPending ? 'Raising…' : 'Raise request'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {error && <p className="mt-sm text-small text-blood">{error}</p>}
    </Card>
  );
}

// ------------------------------------------------------------------

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['requests'],
    queryFn: () => getRequests(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['requests'] });
    queryClient.invalidateQueries({ queryKey: ['breaches'] });
  };

  const check = useMutation({
    mutationFn: detectBreaches,
    onSuccess: (res) => {
      setNotice({ tone: res.drafted > 0 ? 'warning' : 'info', text: res.message });
      refresh();
    },
    onError: (e) => setNotice({ tone: 'danger', text: toFormError(e).message }),
  });

  const requests = data?.requests ?? [];
  const drafts = requests.filter((r) => r.state === 'DETECTED');
  const active = requests.filter(
    (r) => !['DETECTED', 'CLOSED', 'CANCELLED'].includes(r.state)
  );
  const finished = requests.filter((r) => ['CLOSED', 'CANCELLED'].includes(r.state));

  return (
    <DashboardShell
      title="Alerts and requests"
      standfirst="Nothing here reaches a donor until you approve it."
    >
      {notice && (
        <div className="mb-lg">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      <div className="mb-lg flex flex-wrap items-center gap-md">
        <Button
          variant="secondary"
          onClick={() => check.mutate()}
          disabled={check.isPending}
        >
          {check.isPending ? 'Checking…' : 'Check stock now'}
        </Button>
        <ManualRequestForm onDone={refresh} />
      </div>

      {isLoading && <Spinner label="Loading alerts" />}
      {isError && <Alert tone="danger">Could not load alerts.</Alert>}

      {data && (
        <>
          <section className="mb-xl">
            <h2 className="mb-md text-h4 font-semibold">
              Waiting for your approval ({drafts.length})
            </h2>
            {drafts.length === 0 ? (
              <Card>
                <p className="text-small text-ink-muted">
                  Nothing waiting. Drafts appear here when a blood group falls to
                  or below the minimum you confirmed.
                </p>
              </Card>
            ) : (
              <>
                {/* No "approve all" control. Each one is approved by
                    someone who read it. */}
                {drafts.map((item) => (
                  <DraftCard key={item.id} item={item} onDone={refresh} />
                ))}
              </>
            )}
          </section>

          {active.length > 0 && (
            <section className="mb-xl">
              <h2 className="mb-md text-h4 font-semibold">Active ({active.length})</h2>
              {active.map((item) => (
                <ActiveCard key={item.id} item={item} onDone={refresh} />
              ))}
            </section>
          )}

          {finished.length > 0 && (
            <section>
              <h2 className="mb-md text-h4 font-semibold">Finished ({finished.length})</h2>
              {finished.slice(0, 10).map((item) => (
                <Card key={item.id} className="mb-sm">
                  <div className="flex items-center justify-between text-small">
                    <span>
                      <strong className="text-blood">{item.bloodGroup}</strong> ·{' '}
                      {item.unitsNeeded} units · {STATE_LABEL[item.state]}
                    </span>
                    <span className="text-tiny text-ink-muted">
                      {new Date(item.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </Card>
              ))}
            </section>
          )}
        </>
      )}
    </DashboardShell>
  );
}
