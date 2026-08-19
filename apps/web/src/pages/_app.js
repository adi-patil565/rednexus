import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../context/AuthContext.js';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  // Created in state so React 19 strict-mode double-mounting does not
  // discard the cache on every render.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Usage and threshold data changes at human speed, not
            // machine speed. Refetching on every window focus would be
            // noise on a screen staff keep open all day.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
