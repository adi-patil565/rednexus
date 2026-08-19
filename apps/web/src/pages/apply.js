'use client';

// Blood bank application.
//
// Until this existed, institutions could only arrive through the seed
// script — the admin verification flow was real but had nothing to
// verify. This is the front door.
//
// One screen creates both the sign-in account and the application,
// because verification refuses an institution with no staff account.
// Splitting them would let an application land in a state no
// administrator could approve, with nothing on screen explaining why.

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation } from '@tanstack/react-query';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, applyAsInstitution, toFormError } from '@rednexus/api';
import { Card, Button, Alert } from '../components/ui/index.js';

const inputClass =
  'w-full rounded-md border border-black/15 px-sm py-sm focus:border-primary focus:outline-none';

const Field = ({ label, hint, error, children }) => (
  <label className="mb-lg block">
    <span className="mb-xs block text-sm font-medium">{label}</span>
    {hint && <span className="mb-xs block text-xs text-ink-muted">{hint}</span>}
    {children}
    {error && <span className="mt-xs block text-sm text-danger">{error}</span>}
  </label>
);

const FIREBASE_ERRORS = {
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/weak-password': 'Use a longer password - at least 10 characters.',
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/operation-not-allowed':
    'Sign-up is switched off for this project. Enable Email/Password in Firebase.',
};

export default function ApplyPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    category: 'EXTERNAL',
    linkedHospitalName: '',
    pincode: '',
    address: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [done, setDone] = useState(null);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((e) => ({ ...e, [k]: null }));
  };

  const submit = useMutation({
    mutationFn: async () => {
      // Account first: the API ties the application to whoever is
      // signed in, and that person becomes the first staff member.
      await createUserWithEmailAndPassword(auth, form.contactEmail.trim(), form.password);

      const { password, ...application } = form;
      return applyAsInstitution(application);
    },
    onSuccess: (data) => setDone(data),
    onError: (e) => {
      if (e?.code && FIREBASE_ERRORS[e.code]) {
        setBanner(FIREBASE_ERRORS[e.code]);
        return;
      }
      const err = toFormError(e);
      setFieldErrors(err.fields);
      setBanner(err.message);
    },
  });

  if (done) {
    return (
      <div className="mx-auto max-w-md p-xl">
        <h1 className="mb-lg text-center text-xxl font-bold text-primary">Raktasetu</h1>
        <Card>
          <h2 className="mb-md text-lg font-semibold">Application received</h2>
          <p className="text-sm">{done.message}</p>
          <div className="mt-lg">
            <Link href="/dashboard">
              <Button>Go to the dashboard</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-lg py-xl">
      <h1 className="mb-xs text-center text-xxl font-bold text-primary">Raktasetu</h1>
      <p className="mb-lg text-center text-sm text-ink-muted">
        Register your blood bank
      </p>

      {banner && (
        <div className="mb-lg">
          <Alert tone="danger">{banner}</Alert>
        </div>
      )}

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBanner(null);
            submit.mutate();
          }}
        >
          <h2 className="mb-md font-semibold">About the blood bank</h2>

          <Field label="Name" error={fieldErrors.name}>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Sunrise Blood Centre"
            />
          </Field>

          <Field label="Is it inside a hospital?" error={fieldErrors.category}>
            <div className="flex flex-wrap gap-lg">
              {[
                ['EXTERNAL', 'Standalone — we serve several hospitals'],
                ['IN_HOUSE', 'Inside one hospital'],
              ].map(([value, label]) => (
                <label key={value} className="flex items-center gap-sm text-sm">
                  <input
                    type="radio"
                    name="category"
                    checked={form.category === value}
                    onChange={() => set('category', value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          {form.category === 'IN_HOUSE' && (
            <Field label="Which hospital?" error={fieldErrors.linkedHospitalName}>
              <input
                className={inputClass}
                value={form.linkedHospitalName}
                onChange={(e) => set('linkedHospitalName', e.target.value)}
              />
            </Field>
          )}

          <Field label="PIN code" error={fieldErrors.pincode}>
            <input
              inputMode="numeric"
              className={inputClass}
              value={form.pincode}
              onChange={(e) => set('pincode', e.target.value)}
            />
          </Field>

          <Field label="Address" error={fieldErrors.address}>
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>

          <h2 className="mb-md mt-xl font-semibold">Your account</h2>
          <p className="mb-lg text-xs text-ink-muted">
            You will be the first staff member. You can add colleagues later.
            Confirming thresholds and approving alerts are always recorded
            against a named person, so every blood bank needs at least one
            account before it can go live.
          </p>

          <Field label="Your name" error={fieldErrors.contactName}>
            <input
              className={inputClass}
              value={form.contactName}
              onChange={(e) => set('contactName', e.target.value)}
            />
          </Field>

          <Field label="Work email" error={fieldErrors.contactEmail}>
            <input
              type="email"
              className={inputClass}
              value={form.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
            />
          </Field>

          <Field label="Mobile number" error={fieldErrors.contactPhone}>
            <input
              type="tel"
              inputMode="numeric"
              className={inputClass}
              value={form.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
            />
          </Field>

          <Field label="Choose a password" hint="At least 10 characters." error={fieldErrors.password}>
            <input
              type="password"
              className={inputClass}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>

          <Button type="submit" className="w-full" disabled={submit.isPending}>
            {submit.isPending ? 'Submitting…' : 'Apply'}
          </Button>
        </form>
      </Card>

      <p className="mt-lg text-center text-xs text-ink-muted">
        A platform administrator checks every application before a blood bank
        can report usage or contact donors.
      </p>
    </div>
  );
}
