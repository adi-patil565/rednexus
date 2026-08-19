'use client';

// My donations (F8).
//
// The reason to keep the app between requests. Shows the donation
// history and the haemoglobin readings the blood bank recorded, with no
// interpretation attached - the app reports what was measured and never
// tells anyone what it means about their health.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyDonations } from '@rednexus/api';
import DonorShell from '../components/layout/DonorShell.js';
import { useAuth } from '../context/AuthContext.js';
import { Card, Spinner, Alert } from '../components/ui/index.js';

export default function DonationsPage() {
  const { profile, isAuthenticated } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-donations'],
    queryFn: getMyDonations,
    enabled: isAuthenticated && profile?.kind === 'DONOR',
  });

  return (
    <DonorShell title="My donations">
      {isLoading && <Spinner label="Loading your donations" />}
      {isError && <Alert tone="danger">Could not load your donations.</Alert>}

      {data && (
        <>
          <Card className="mb-lg">
            <p className="text-sm text-ink-muted">Times you have donated</p>
            <p className="text-xxl font-bold text-primary">{data.total}</p>
          </Card>

          {data.donations.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">
                No donations recorded yet. Once you donate, it will show here.
              </p>
            </Card>
          ) : (
            data.donations.map((d) => (
              <Card key={d.id} className="mb-sm">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">
                      {new Date(d.date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-ink-muted">{d.bloodBank}</p>
                  </div>
                  {d.hbValue != null && (
                    <div className="text-right">
                      <p className="font-semibold">{d.hbValue} g/dl</p>
                      <p className="text-xs text-ink-muted">Haemoglobin</p>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </>
      )}
    </DonorShell>
  );
}
