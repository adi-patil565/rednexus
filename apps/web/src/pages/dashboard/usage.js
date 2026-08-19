'use client';

// Daily usage entry (T1).
//
// This screen is reported EVERY DAY, and PRD section 10 is blunt about
// the consequence: "if it takes more than a minute, staff will stop
// doing it consistently, which quietly breaks the whole mechanism."
//
// So the design is built around speed:
//   - all eight blood groups on one screen, no pagination, no per-group
//     save, one submit
//   - Enter moves down the column rather than submitting the form, so
//     the whole grid is keyboard-fillable without touching the mouse
//   - yesterday's numbers are pre-filled as a starting point, because
//     stock rarely changes shape overnight
//   - the last 7 days sit directly below the form, so a typo from
//     yesterday is visible while you are already here to fix it
//     (re-reporting a day corrects it - the API upserts)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUsageHistory, submitUsageReport, toFormError } from '@rednexus/api';
import { BLOOD_GROUPS, BLOOD_GROUP_LABELS } from '@rednexus/types';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Button, Alert, Spinner, Badge } from '../../components/ui/index.js';

const today = () => new Date().toISOString().slice(0, 10);

const emptyRow = () => ({ unitsIssued: '', stockOnHand: '' });

export default function UsageEntryPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState(() =>
    Object.fromEntries(BLOOD_GROUPS.map((g) => [g, emptyRow()]))
  );
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const inputRefs = useRef({});

  const history = useQuery({
    queryKey: ['usage', 7],
    queryFn: () => getUsageHistory(7),
  });

  // Pre-fill from the most recent report. Stock rarely changes shape
  // overnight, so starting from yesterday is far less typing than
  // starting from blank - and the numbers are still explicitly
  // confirmed by whoever submits.
  useEffect(() => {
    const latest = history.data?.history?.[0];
    if (!latest) return;
    setRows((prev) => {
      const anyTyped = Object.values(prev).some((r) => r.unitsIssued !== '' || r.stockOnHand !== '');
      if (anyTyped) return prev;
      return Object.fromEntries(
        BLOOD_GROUPS.map((g) => {
          const prior = latest.groups?.[BLOOD_GROUP_LABELS[g]];
          return [g, { unitsIssued: '', stockOnHand: prior ? String(prior.stockOnHand) : '' }];
        })
      );
    });
  }, [history.data]);

  const mutation = useMutation({
    mutationFn: submitUsageReport,
    onSuccess: (data) => {
      setErrors({});
      setBanner({
        tone: 'success',
        text: `Saved ${data.recorded} blood groups for ${data.date}. ${data.totalUnitsIssued} units issued.`,
      });
      queryClient.invalidateQueries({ queryKey: ['usage'] });
      queryClient.invalidateQueries({ queryKey: ['thresholds'] });
    },
    onError: (error) => {
      const e = toFormError(error);
      setErrors(e.fields);
      setBanner({ tone: 'danger', text: e.message });
    },
  });

  const filled = useMemo(
    () =>
      BLOOD_GROUPS.filter(
        (g) => rows[g].unitsIssued !== '' && rows[g].stockOnHand !== ''
      ),
    [rows]
  );

  const setCell = (group, field, value) => {
    setRows((prev) => ({ ...prev, [group]: { ...prev[group], [field]: value } }));
    setBanner(null);
  };

  // Enter advances down the column instead of submitting. Submitting on
  // Enter mid-grid is the classic way to lose a half-filled form.
  const onKeyDown = (e, index, field) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = BLOOD_GROUPS[index + 1];
    if (next) inputRefs.current[`${next}-${field}`]?.focus();
  };

  const submit = (e) => {
    e.preventDefault();
    const entries = filled.map((g) => ({
      bloodGroup: g,
      unitsIssued: Number(rows[g].unitsIssued),
      stockOnHand: Number(rows[g].stockOnHand),
    }));
    if (entries.length === 0) {
      setBanner({ tone: 'danger', text: 'Enter at least one blood group before saving.' });
      return;
    }
    mutation.mutate({ date, entries });
  };

  return (
    <DashboardShell
      title="Daily usage"
      standfirst="Units issued today and what is left on the shelf. Takes under a minute."
    >
      {banner && (
        <div className="mb-lg">
          <Alert tone={banner.tone}>{banner.text}</Alert>
        </div>
      )}

      <form onSubmit={submit}>
        <Card>
          <div className="mb-lg flex flex-wrap items-end justify-between gap-md">
            <label className="text-small">
              <span className="mb-xs block font-medium">Date</span>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-rule px-sm py-xs"
              />
              <span className="ml-sm text-tiny text-ink-muted">
                Missed a day? Pick it here and fill it in.
              </span>
            </label>
            <p className="text-small text-ink-muted">
              {filled.length} of {BLOOD_GROUPS.length} filled
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-small">
              <thead>
                <tr className="border-b border-rule text-left text-tiny uppercase tracking-wide text-ink-muted">
                  <th className="pb-sm">Blood group</th>
                  <th className="pb-sm">Units issued today</th>
                  <th className="pb-sm">Units left in stock</th>
                </tr>
              </thead>
              <tbody>
                {BLOOD_GROUPS.map((g, i) => (
                  <tr key={g} className="border-b border-black/5">
                    <td className="py-sm font-semibold">{BLOOD_GROUP_LABELS[g]}</td>
                    {['unitsIssued', 'stockOnHand'].map((field) => (
                      <td key={field} className="py-sm pr-md">
                        <input
                          ref={(el) => {
                            inputRefs.current[`${g}-${field}`] = el;
                          }}
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={rows[g][field]}
                          onChange={(e) => setCell(g, field, e.target.value)}
                          onKeyDown={(e) => onKeyDown(e, i, field)}
                          placeholder="0"
                          className="w-24 rounded-md border border-rule px-sm py-xs text-right focus:border-blood focus:outline-none"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-lg flex items-center gap-md">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save today’s usage'}
            </Button>
            <span className="text-tiny text-ink-muted">
              Saving again for the same date replaces that day’s numbers.
            </span>
          </div>

          {Object.keys(errors).length > 0 && (
            <ul className="mt-md list-disc pl-lg text-small text-blood">
              {Object.entries(errors).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          )}
        </Card>
      </form>

      <section className="mt-xl">
        <h2 className="mb-md text-h4 font-semibold">Last 7 days</h2>
        {history.isLoading && <Spinner label="Loading recent reports" />}
        {history.isError && <Alert tone="danger">Could not load recent reports.</Alert>}

        {history.data && (
          <>
            {history.data.missingDates?.length > 0 && (
              <div className="mb-md">
                <Alert tone="warning" title="Days with no report">
                  {history.data.missingDates.join(', ')} — thresholds are
                  calculated from what is reported, so gaps make them less
                  reliable.
                </Alert>
              </div>
            )}

            <Card className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-small">
                <thead>
                  <tr className="border-b border-rule text-left text-tiny uppercase tracking-wide text-ink-muted">
                    <th className="pb-sm">Date</th>
                    {history.data.bloodGroups.map((label) => (
                      <th key={label} className="pb-sm text-right">
                        {label}
                      </th>
                    ))}
                    <th className="pb-sm text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.history.map((row) => (
                    <tr key={row.date} className="border-b border-black/5">
                      <td className="py-sm">{row.date}</td>
                      {history.data.bloodGroups.map((label) => (
                        <td key={label} className="py-sm text-right tabular-nums">
                          {row.groups[label]?.unitsIssued ?? '—'}
                        </td>
                      ))}
                      <td className="py-sm text-right font-semibold tabular-nums">
                        {row.totalIssued}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.data.history.length === 0 && (
                <p className="py-md text-small text-ink-muted">
                  Nothing reported yet. Today’s entry will appear here.
                </p>
              )}
            </Card>
          </>
        )}
      </section>
    </DashboardShell>
  );
}
