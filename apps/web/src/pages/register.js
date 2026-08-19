'use client';

// Donor registration (F1) — the QR camp flow.
//
// Reached by scanning a QR code at a camp: /register?camp=<id>. No app
// install, no account first. Someone standing in a queue fills this in
// on their phone.
//
// Twelve fields, filtered from the ~60 questions on the D Y Patil
// Hospital Blood Centre questionnaire. Everything medical stays on
// paper and is answered in person, because those answers are
// time-windowed ("in the last 3 months"), because Q10-12 is the most
// sensitive category the DPDP Act recognises, and because the paper
// form already routes them to the doctor present.
//
// One question here does real work: "Has anyone ever advised you not to
// donate blood?" A yes does not reject anyone and does not ask why - it
// routes the person to a human, exactly as the paper form does.

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation } from '@tanstack/react-query';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, registerDonor, toFormError } from '@rednexus/api';
import { BLOOD_GROUPS, BLOOD_GROUP_LABELS } from '@rednexus/types';
import { Card, Button, Alert } from '../components/ui/index.js';

const Field = ({ label, hint, error, children }) => (
  <label className="mb-lg block">
    <span className="mb-xs block text-small font-medium">{label}</span>
    {hint && <span className="mb-xs block text-tiny text-ink-muted">{hint}</span>}
    {children}
    {error && <span className="mt-xs block text-small text-blood">{error}</span>}
  </label>
);

const inputClass =
  'w-full rounded-md border border-rule px-sm py-sm focus:border-blood focus:outline-none';

export default function RegisterPage() {
  const router = useRouter();
  const campId = typeof router.query.camp === 'string' ? router.query.camp : undefined;

  const [form, setForm] = useState({
    name: '',
    gender: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    password: '',
    areaPincode: '',
    bloodGroupSelfReported: '',
    donatedBefore: false,
    priorDonationCount: '',
    lastDonationDate: '',
    donationType: 'VOLUNTARY',
    patientName: '',
    advisedNotToDonate: false,
    consentGiven: false,
    notifyAbnormalResults: false,
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
      // Create the sign-in account FIRST, then register. The API links
      // the donor record to whoever is signed in, and without that a
      // donor could register and then never sign in to see the alerts
      // they registered to receive.
      //
      // If account creation fails (email already used, weak password)
      // nothing is written on either side.
      await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);

      return registerDonor({
        ...form,
        priorDonationCount: form.priorDonationCount === '' ? undefined : form.priorDonationCount,
        lastDonationDate: form.lastDonationDate === '' ? undefined : form.lastDonationDate,
        patientName: form.patientName || undefined,
        registeredAtCampId: campId,
      });
    },
    onSuccess: (data) => setDone(data),
    onError: (e) => {
      // Firebase errors carry a `code`; API errors carry a response.
      const FIREBASE = {
        'auth/email-already-in-use':
          'That email already has an account. Sign in instead.',
        'auth/weak-password': 'Use a longer password - at least 10 characters.',
        'auth/invalid-email': 'That does not look like an email address.',
        'auth/operation-not-allowed':
          'Sign-up is switched off for this project. Enable Email/Password in Firebase.',
      };
      if (e?.code && FIREBASE[e.code]) {
        setBanner(FIREBASE[e.code]);
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
        <h1 className="mb-lg text-center text-h3 font-bold text-blood">Raktasetu</h1>
        <Card>
          <h2 className="mb-md text-h4 font-semibold">Thank you for registering</h2>
          <p className="text-small">{done.message}</p>
          <div className="mt-lg">
            <Link href="/">
              <Button>Go to my home page</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-lg py-xl">
      <h1 className="mb-xs text-center text-h3 font-bold text-blood">Raktasetu</h1>
      <p className="mb-lg text-center text-small text-ink-muted">Register as a blood donor</p>

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
          <Field label="Your name" error={fieldErrors.name}>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field label="Gender" error={fieldErrors.gender}>
            <select
              className={inputClass}
              value={form.gender}
              onChange={(e) => set('gender', e.target.value)}
            >
              <option value="">Choose</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          <Field label="Date of birth" error={fieldErrors.dateOfBirth}>
            <input
              type="date"
              className={inputClass}
              value={form.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
            />
          </Field>

          <Field
            label="Mobile number"
            hint="This is how the blood bank will reach you."
            error={fieldErrors.phone}
          >
            <input
              type="tel"
              inputMode="numeric"
              className={inputClass}
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>

          <Field
            label="Email"
            hint="You will use this to sign in and see requests."
            error={fieldErrors.email}
          >
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>

          <Field
            label="Choose a password"
            hint="At least 10 characters."
            error={fieldErrors.password}
          >
            <input
              type="password"
              className={inputClass}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
            />
          </Field>

          <Field
            label="PIN code"
            hint="Your area only. We do not ask for your full address."
            error={fieldErrors.areaPincode}
          >
            <input
              inputMode="numeric"
              className={inputClass}
              value={form.areaPincode}
              onChange={(e) => set('areaPincode', e.target.value)}
            />
          </Field>

          <Field
            label="Your blood group"
            hint="If you are not sure, choose your best guess. The blood bank tests it when you donate."
            error={fieldErrors.bloodGroupSelfReported}
          >
            <select
              className={inputClass}
              value={form.bloodGroupSelfReported}
              onChange={(e) => set('bloodGroupSelfReported', e.target.value)}
            >
              <option value="">Choose</option>
              {BLOOD_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {BLOOD_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Have you donated blood before?">
            <div className="flex gap-lg">
              {[['Yes', true], ['No', false]].map(([label, value]) => (
                <label key={label} className="flex items-center gap-sm text-small">
                  <input
                    type="radio"
                    name="donatedBefore"
                    checked={form.donatedBefore === value}
                    onChange={() => set('donatedBefore', value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          {form.donatedBefore && (
            <>
              <Field label="When did you last donate?" error={fieldErrors.lastDonationDate}>
                <input
                  type="date"
                  className={inputClass}
                  value={form.lastDonationDate}
                  onChange={(e) => set('lastDonationDate', e.target.value)}
                />
              </Field>

              <Field label="How many times have you donated?" error={fieldErrors.priorDonationCount}>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className={inputClass}
                  value={form.priorDonationCount}
                  onChange={(e) => set('priorDonationCount', e.target.value)}
                />
              </Field>
            </>
          )}

          <Field label="Are you donating for a particular patient?">
            <div className="flex gap-lg">
              {[['No, for anyone who needs it', 'VOLUNTARY'], ['Yes, for someone I know', 'REPLACEMENT']].map(
                ([label, value]) => (
                  <label key={value} className="flex items-center gap-sm text-small">
                    <input
                      type="radio"
                      name="donationType"
                      checked={form.donationType === value}
                      onChange={() => set('donationType', value)}
                    />
                    {label}
                  </label>
                )
              )}
            </div>
          </Field>

          {form.donationType === 'REPLACEMENT' && (
            <Field label="Patient's name" error={fieldErrors.patientName}>
              <input
                className={inputClass}
                value={form.patientName}
                onChange={(e) => set('patientName', e.target.value)}
              />
            </Field>
          )}

          {/* Q1.5. A yes routes to a human; it does not reject anyone,
              and the app never asks why. */}
          <Field
            label="Has anyone ever advised you not to donate blood?"
            hint="If yes, blood bank staff will talk to you before you are asked to donate. You can still register."
          >
            <div className="flex gap-lg">
              {[['Yes', true], ['No', false]].map(([label, value]) => (
                <label key={label} className="flex items-center gap-sm text-small">
                  <input
                    type="radio"
                    name="advisedNotToDonate"
                    checked={form.advisedNotToDonate === value}
                    onChange={() => set('advisedNotToDonate', value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          <div className="mb-lg rounded-md bg-paper p-md">
            <label className="flex items-start gap-sm text-small">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.consentGiven}
                onChange={(e) => set('consentGiven', e.target.checked)}
              />
              {/* Wording taken from the blood centre's own consent
                  clause (a). Paid donation is illegal in India, and the
                  form says so in the donor's own words. */}
              <span>
                I understand that blood donation is voluntary and that no payment
                or reward has been offered. I agree to be contacted when blood of
                my group is needed nearby.
              </span>
            </label>
            {fieldErrors.consentGiven && (
              <p className="mt-xs text-small text-blood">{fieldErrors.consentGiven}</p>
            )}

            {/* Consent clause (e) - a choice, not an assumption. */}
            <label className="mt-md flex items-start gap-sm text-small">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.notifyAbnormalResults}
                onChange={(e) => set('notifyAbnormalResults', e.target.checked)}
              />
              <span>
                If any of my blood test results are unusual, I would like to be
                told.
              </span>
            </label>
          </div>

          <Button type="submit" className="w-full" disabled={submit.isPending}>
            {submit.isPending ? 'Registering…' : 'Register'}
          </Button>
        </form>
      </Card>

      <p className="mt-lg text-center text-tiny text-ink-muted">
        Your phone number is shared only with a blood bank you agree to donate
        for. It is never shown to patients or their families.
      </p>
    </div>
  );
}
