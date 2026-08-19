'use client';

// Auth context.
//
// Firebase answers "who is this?". The Express API answers "what may
// they do?" - role, institution and verification status come from
// Postgres via /api/auth/me, never from a token claim or a Firestore
// document the browser could write.
//
// This replaces the previous Firestore-backed flow, in which the client
// wrote its own role at signup and could re-create a fabricated DONOR
// profile for itself when a document was missing.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, client } from '@rednexus/api';

const AuthContext = createContext({
  firebaseUser: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
  refresh: () => {},
  logout: () => {},
});

export const AuthProvider = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await client.get('/api/auth/me');
      setProfile(data);
      setError(null);
    } catch (e) {
      setProfile(null);
      setError(
        e?.response?.status === 503
          ? 'The server cannot verify sign-ins right now.'
          : 'Could not load your account.'
      );
    }
  }, []);

  useEffect(() => {
    let settled = false;

    // Firebase resolves the initial auth state by reading its
    // persistence layer (IndexedDB). That read can stall indefinitely -
    // private browsing, blocked storage, some embedded webviews - and
    // when it does, onAuthStateChanged simply never fires.
    //
    // Without a bound, the whole app sits on a spinner forever with no
    // explanation and no way out. Treat a stalled initialisation as
    // "signed out, and say so" rather than as "wait".
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      setFirebaseUser(null);
      setProfile(null);
      setError('Could not start the sign-in service. Try reloading the page.');
      setIsLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        settled = true;
        clearTimeout(timeout);
        setFirebaseUser(user);
        if (user) {
          await loadProfile();
        } else {
          setProfile(null);
          setError(null);
        }
        setIsLoading(false);
      },
      (err) => {
        // The error callback most people forget to pass. Without it an
        // initialisation failure is silent.
        settled = true;
        clearTimeout(timeout);
        setFirebaseUser(null);
        setProfile(null);
        setError(err?.message ?? 'Sign-in service unavailable.');
        setIsLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [loadProfile]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        isLoading,
        isAuthenticated: Boolean(firebaseUser),
        error,
        refresh: loadProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
