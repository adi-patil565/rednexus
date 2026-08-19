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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await loadProfile();
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
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
