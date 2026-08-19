'use client';

// Donor settings (F3).
//
// Pause is the control that matters. Donor fatigue is one of the two
// failure modes this project exists to avoid, and a donor who cannot
// easily stop being contacted stops answering instead - which looks
// identical in the data and is much worse.

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMyPreferences, toFormError } from '@rednexus/api';
import DonorShell from '../components/layout/DonorShell.js';
import { useAuth } from '../context/AuthContext.js';
import { Card, Button, Alert } from '../components/ui/index.js';

export default function PreferencesPage() {
  const { profile, refresh } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState(null);

  const save = useMutation({
    mutationFn: (prefs) => updateMyPreferences(prefs),
    onSuccess: async (data) => {
      setNotice({ tone: 'success', text: data.message });
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['my-alerts'] });
    },
    onError: (e) => setNotice({ tone: 'danger', text: toFormError(e).message }),
  });

  const paused = profile?.notificationsPaused;

  return (
    <DonorShell title="Settings">
      {notice && (
        <div className="mb-lg">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      <Card className="mb-lg">
        <h2 className="mb-sm font-semibold">Requests for blood</h2>
        <p className="mb-md text-sm text-ink-muted">
          {paused
            ? 'You are not being contacted at the moment.'
            : 'We contact you when blood of your group is needed nearby. Never more than twice a month.'}
        </p>
        <Button
          variant={paused ? 'primary' : 'secondary'}
          onClick={() => save.mutate({ notificationsPaused: !paused })}
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving…' : paused ? 'Start contacting me again' : 'Pause requests'}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-sm font-semibold">How we contact you</h2>
        <p className="mb-md text-sm text-ink-muted">
          Choose what works best on your phone.
        </p>
        <div className="flex flex-wrap gap-md">
          {[
            ['SMS', 'Text message'],
            ['PUSH', 'App notification'],
            ['IVR', 'Phone call'],
            ['EMAIL', 'Email'],
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-sm text-sm">
              <input
                type="radio"
                checked={profile?.preferredChannel === value}
                onChange={() => save.mutate({ preferredChannel: value })}
              />
              {label}
            </label>
          ))}
        </div>
      </Card>
    </DonorShell>
  );
}
