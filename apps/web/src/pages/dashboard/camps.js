'use client';

// Camps (F10) — blood bank side.
//
// The listing layer. N3, which uses T4's collection targets to
// recommend where and when a camp should be held, is separate and
// later.
//
// The most useful thing on this page is the registration link. Printed
// as a QR code on the camp banner, it is how donors actually enter the
// platform — and because it carries the camp id, every donor who scans
// it arrives tagged with where they came from. That is what eventually
// makes "which camps actually recruit" an answerable question rather
// than a guess.

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyCamps, createCamp, cancelCamp, toFormError } from '@rednexus/api';
import DashboardShell from '../../components/layout/DashboardShell.js';
import { Card, Button, Alert, Spinner, Badge } from '../../components/ui/index.js';

const inputClass =
  'w-full rounded-md border border-black/15 px-sm py-xs focus:border-primary focus:outline-none';

const today = () => new Date().toISOString().slice(0, 10);

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function RegistrationLink({ path }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  return (
    <div className="mt-md rounded-md bg-canvas p-md">
      <p className="mb-xs text-xs font-medium uppercase tracking-wide text-ink-muted">
        Registration link for the banner
      </p>
      <p className="break-all font-mono text-xs">{url}</p>
      <div className="mt-sm flex items-center gap-md">
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <span className="text-xs text-ink-muted">
          Print this as a QR code. Anyone who scans it registers against
          this camp.
        </span>
      </div>
    </div>
  );
}

function NewCampForm({ onDone }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    date: '',
    timeNote: '',
    location: '',
    pincode: '',
    notes: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState(null);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((e) => ({ ...e, [k]: null }));
  };

  const create = useMutation({
    mutationFn: () => createCamp(form),
    onSuccess: () => {
      setOpen(false);
      setForm({ title: '', date: '', timeNote: '', location: '', pincode: '', notes: '' });
      onDone();
    },
    onError: (e) => {
      const err = toFormError(e);
      setFieldErrors(err.fields);
      setError(err.message);
    },
  });

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Post a camp</Button>;
  }

  return (
    <Card>
      <h3 className="mb-md font-semibold">Post a camp</h3>

      <div className="grid gap-md sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          <span className="mb-xs block font-medium">What is it called?</span>
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="MGM Campus Drive"
          />
          {fieldErrors.title && <span className="text-sm text-danger">{fieldErrors.title}</span>}
        </label>

        <label className="text-sm">
          <span className="mb-xs block font-medium">Date</span>
          <input
            type="date"
            min={today()}
            className={inputClass}
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
          />
          {fieldErrors.date && <span className="text-sm text-danger">{fieldErrors.date}</span>}
        </label>

        <label className="text-sm">
          <span className="mb-xs block font-medium">Timing</span>
          <input
            className={inputClass}
            value={form.timeNote}
            onChange={(e) => set('timeNote', e.target.value)}
            placeholder="9 AM to 4 PM"
          />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-xs block font-medium">Where</span>
          <input
            className={inputClass}
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="MGM Campus, Sector 1, Kamothe"
          />
          {fieldErrors.location && (
            <span className="text-sm text-danger">{fieldErrors.location}</span>
          )}
        </label>

        <label className="text-sm">
          <span className="mb-xs block font-medium">PIN code</span>
          <input
            className={inputClass}
            value={form.pincode}
            onChange={(e) => set('pincode', e.target.value)}
            placeholder="410209"
          />
          {fieldErrors.pincode && (
            <span className="text-sm text-danger">{fieldErrors.pincode}</span>
          )}
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-xs block font-medium">Anything else donors should know</span>
          <input
            className={inputClass}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Parking behind the main building"
          />
        </label>
      </div>

      <div className="mt-lg flex gap-md">
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? 'Posting…' : 'Post camp'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </Card>
  );
}

function CampCard({ camp, onDone }) {
  const [error, setError] = useState(null);

  const cancel = useMutation({
    mutationFn: () => cancelCamp(camp.id),
    onSuccess: onDone,
    onError: (e) => setError(toFormError(e).message),
  });

  return (
    <Card className="mb-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="text-lg font-semibold">{camp.title}</p>
          <p className="text-sm text-ink-muted">
            {formatDate(camp.date)}
            {camp.timeNote ? ` · ${camp.timeNote}` : ''}
          </p>
          <p className="text-sm text-ink-muted">
            {camp.location} · PIN {camp.pincode}
          </p>
          {camp.notes && <p className="mt-xs text-sm">{camp.notes}</p>}
        </div>
        <div className="text-right">
          {camp.cancelled ? (
            <Badge tone="neutral">Cancelled</Badge>
          ) : camp.past ? (
            <Badge tone="neutral">Past</Badge>
          ) : (
            <Badge tone="success">Upcoming</Badge>
          )}
          <p className="mt-xs text-xs text-ink-muted">
            {camp.interestedCount}{' '}
            {camp.interestedCount === 1 ? 'donor hopes' : 'donors hope'} to come
          </p>
        </div>
      </div>

      {!camp.cancelled && !camp.past && <RegistrationLink path={camp.registrationPath} />}

      {!camp.cancelled && !camp.past && (
        <div className="mt-md">
          <Button variant="secondary" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel camp'}
          </Button>
          <span className="ml-md text-xs text-ink-muted">
            Donors who said they would come will see it is off.
          </span>
        </div>
      )}

      {error && <p className="mt-sm text-sm text-danger">{error}</p>}
    </Card>
  );
}

export default function CampsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-camps'], queryFn: getMyCamps });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-camps'] });

  const camps = data?.camps ?? [];
  const upcoming = camps.filter((c) => !c.past && !c.cancelled);
  const rest = camps.filter((c) => c.past || c.cancelled);

  return (
    <DashboardShell
      title="Camps"
      subtitle="Post a drive so donors nearby can see it."
    >
      <div className="mb-lg">
        <NewCampForm onDone={refresh} />
      </div>

      {isLoading && <Spinner label="Loading camps" />}
      {isError && <Alert tone="danger">Could not load camps.</Alert>}

      {data && (
        <>
          <section className="mb-xl">
            <h2 className="mb-md text-lg font-semibold">Upcoming ({upcoming.length})</h2>
            {upcoming.length === 0 ? (
              <Card>
                <p className="text-sm text-ink-muted">
                  No camps posted. Donors in your area will see one as soon as you
                  add it.
                </p>
              </Card>
            ) : (
              upcoming.map((c) => <CampCard key={c.id} camp={c} onDone={refresh} />)
            )}
          </section>

          {rest.length > 0 && (
            <section>
              <h2 className="mb-md text-lg font-semibold">Past and cancelled</h2>
              {rest.map((c) => (
                <CampCard key={c.id} camp={c} onDone={refresh} />
              ))}
            </section>
          )}
        </>
      )}
    </DashboardShell>
  );
}
