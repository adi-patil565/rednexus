'use client';

// Recurring patients (N1).
//
// Thalassemia, dialysis, chemotherapy — patients whose next transfusion
// date is known weeks ahead. That advance notice is the whole point:
// this is the one case where donors can be lined up BEFORE anyone is
// short of anything.
//
// The screen never asks for a patient's name. It asks for the reference
// the blood bank already uses on its own records, because a donor must
// never be able to reach a patient and the cleanest guarantee is that
// this platform does not know who the patient is.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  arrangeUpcoming,
  completeTransfusion,
  toFormError,
} from '@rednexus/api';
import { BLOOD_GROUPS, BLOOD_GROUP_LABELS } from '@rednexus/types';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Button, Alert, Spinner, Badge } from '../../components/ui/index.js';

const inputClass =
  'w-full rounded-md border border-rule px-sm py-xs focus:border-blood focus:outline-none';

const FREQUENCIES = [
  ['WEEKLY', 'Every week'],
  ['FORTNIGHTLY', 'Every 2 weeks'],
  ['MONTHLY', 'Every month'],
  ['EVERY_SIX_WEEKS', 'Every 6 weeks'],
];

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function NewScheduleForm({ onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    patientRef: '',
    bloodGroup: 'O_POS',
    unitsPerVisit: '2',
    frequency: 'FORTNIGHTLY',
    nextDueDate: '',
    leadDays: '7',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((e) => ({ ...e, [k]: null }));
  };

  const create = useMutation({
    mutationFn: () => createSchedule(form),
    onSuccess: () => {
      setOpen(false);
      setForm({ ...form, patientRef: '', nextDueDate: '' });
      onDone();
    },
    onError: (e) => {
      const err = toFormError(e);
      setFieldErrors(err.fields);
      setError(err.message);
    },
  });

  if (!open) return <Button onClick={() => setOpen(true)}>Add a patient</Button>;

  return (
    <Card>
      <h3 className="mb-md font-semibold">Add a recurring patient</h3>

      <div className="grid gap-md sm:grid-cols-2">
        <label className="text-small sm:col-span-2">
          <span className="mb-xs block font-medium">Patient file number</span>
          <input
            className={inputClass}
            value={form.patientRef}
            onChange={(e) => set('patientRef', e.target.value)}
            placeholder="MGM/THAL/2024/118"
          />
          {/* Said plainly, because it is a deliberate choice and staff
              will wonder why the field is not "patient name". */}
          <span className="mt-xs block text-tiny text-ink-muted">
            Use your own reference. Do not enter the patient&rsquo;s name — this
            system never needs to know who they are.
          </span>
          {fieldErrors.patientRef && (
            <span className="text-small text-blood">{fieldErrors.patientRef}</span>
          )}
        </label>

        <label className="text-small">
          <span className="mb-xs block font-medium">Blood group</span>
          <select
            className={inputClass}
            value={form.bloodGroup}
            onChange={(e) => set('bloodGroup', e.target.value)}
          >
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {BLOOD_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-small">
          <span className="mb-xs block font-medium">Units each time</span>
          <input
            type="number"
            min="1"
            className={inputClass}
            value={form.unitsPerVisit}
            onChange={(e) => set('unitsPerVisit', e.target.value)}
          />
        </label>

        <label className="text-small">
          <span className="mb-xs block font-medium">How often</span>
          <select
            className={inputClass}
            value={form.frequency}
            onChange={(e) => set('frequency', e.target.value)}
          >
            {FREQUENCIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-small">
          <span className="mb-xs block font-medium">Next transfusion</span>
          <input
            type="date"
            className={inputClass}
            value={form.nextDueDate}
            onChange={(e) => set('nextDueDate', e.target.value)}
          />
          {fieldErrors.nextDueDate && (
            <span className="text-small text-blood">{fieldErrors.nextDueDate}</span>
          )}
        </label>

        <label className="text-small sm:col-span-2">
          <span className="mb-xs block font-medium">Start arranging donors this many days before</span>
          <input
            type="number"
            min="3"
            max="21"
            className={inputClass}
            value={form.leadDays}
            onChange={(e) => set('leadDays', e.target.value)}
          />
          <span className="mt-xs block text-tiny text-ink-muted">
            About a week works well. Much earlier and donors forget; much later
            and there is no time to ask more people.
          </span>
        </label>
      </div>

      <div className="mt-lg flex gap-md">
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add patient'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {error && <p className="mt-sm text-small text-blood">{error}</p>}
    </Card>
  );
}

function ScheduleCard({ schedule, onDone }) {
  const [error, setError] = useState(null);

  const complete = useMutation({
    mutationFn: () => completeTransfusion(schedule.id),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  const stop = useMutation({
    mutationFn: () => updateSchedule(schedule.id, { active: false }),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  const c = schedule.coverage;
  const days = schedule.daysUntilDue;

  return (
    <Card className={`mb-md ${c.atRisk ? 'border-l-4 border-l-blood' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-small font-semibold">{schedule.patientRef}</p>
          <p className="mt-xs text-small text-ink-muted">
            <strong className="text-blood">{schedule.bloodGroup}</strong> ·{' '}
            {schedule.unitsPerVisit} {schedule.unitsPerVisit === 1 ? 'unit' : 'units'} ·{' '}
            {schedule.frequencyLabel.toLowerCase()}
          </p>
        </div>

        <div className="text-right">
          {!schedule.active ? (
            <Badge tone="neutral">Stopped</Badge>
          ) : days < 0 ? (
            <Badge tone="danger">Overdue</Badge>
          ) : days === 0 ? (
            <Badge tone="danger">Today</Badge>
          ) : days <= schedule.leadDays ? (
            <Badge tone="warning">In {days} days</Badge>
          ) : (
            <Badge tone="neutral">In {days} days</Badge>
          )}
          <p className="mt-xs text-tiny text-ink-muted">{formatDate(schedule.nextDueDate)}</p>
        </div>
      </div>

      {schedule.active && (
        <div className="mt-md rounded-md bg-paper p-md text-small">
          {!c.arranged ? (
            <span className="text-ink-muted">
              Donors will be arranged {schedule.leadDays} days before — that is{' '}
              {days - schedule.leadDays > 0
                ? `in ${days - schedule.leadDays} days`
                : 'due now'}
              .
            </span>
          ) : c.covered ? (
            <span className="text-positive">
              {c.accepted} of {c.needed} donors have agreed. Covered.
            </span>
          ) : (
            <span className={c.atRisk ? 'text-blood' : 'text-ink-muted'}>
              {c.accepted} of {c.needed} donors have agreed.{' '}
              {c.atRisk
                ? `Only ${c.daysRemaining} ${c.daysRemaining === 1 ? 'day' : 'days'} left — contact more people.`
                : `${c.daysRemaining} days left.`}
            </span>
          )}
        </div>
      )}

      {schedule.active && (
        <div className="mt-md flex flex-wrap gap-md">
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
            {complete.isPending ? 'Saving…' : 'Transfusion done'}
          </Button>
          <Button variant="secondary" onClick={() => stop.mutate()} disabled={stop.isPending}>
            Stop schedule
          </Button>
        </div>
      )}

      {error && <p className="mt-sm text-small text-blood">{error}</p>}
    </Card>
  );
}

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['schedules'],
    queryFn: getSchedules,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['schedules'] });
    queryClient.invalidateQueries({ queryKey: ['requests'] });
  };

  const arrange = useMutation({
    mutationFn: arrangeUpcoming,
    onSuccess: (res) => {
      setNotice({ tone: res.drafted > 0 ? 'warning' : 'info', text: res.message });
      refresh();
    },
    onError: (e) => setNotice({ tone: 'danger', text: toFormError(e).message }),
  });

  const schedules = data?.schedules ?? [];
  const active = schedules.filter((s) => s.active);
  const stopped = schedules.filter((s) => !s.active);
  const atRisk = active.filter((s) => s.coverage.atRisk);

  return (
    <DashboardShell
      title="Recurring patients"
      standfirst="Patients who need blood on a regular schedule, so donors can be arranged in advance."
    >
      {notice && (
        <div className="mb-lg">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      {atRisk.length > 0 && (
        <div className="mb-lg">
          <Alert tone="danger" title={`${atRisk.length} transfusion(s) short of donors`}>
            These are due soon and do not have enough donors yet.
          </Alert>
        </div>
      )}

      <div className="mb-lg flex flex-wrap items-center gap-md">
        <NewScheduleForm onDone={refresh} />
        <Button
          variant="secondary"
          onClick={() => arrange.mutate()}
          disabled={arrange.isPending}
        >
          {arrange.isPending ? 'Checking…' : 'Arrange upcoming donors'}
        </Button>
      </div>

      {isLoading && <Spinner label="Loading patients" />}
      {isError && <Alert tone="danger">Could not load recurring patients.</Alert>}

      {data && (
        <>
          <section className="mb-xl">
            <h2 className="mb-md text-h4 font-semibold">Active ({active.length})</h2>
            {active.length === 0 ? (
              <Card>
                <p className="text-small text-ink-muted">
                  No recurring patients yet. Add one and donors will be arranged
                  automatically before each transfusion.
                </p>
              </Card>
            ) : (
              active.map((s) => <ScheduleCard key={s.id} schedule={s} onDone={refresh} />)
            )}
          </section>

          {stopped.length > 0 && (
            <section>
              <h2 className="mb-md text-h4 font-semibold">Stopped ({stopped.length})</h2>
              {stopped.map((s) => (
                <ScheduleCard key={s.id} schedule={s} onDone={refresh} />
              ))}
            </section>
          )}
        </>
      )}
    </DashboardShell>
  );
}
