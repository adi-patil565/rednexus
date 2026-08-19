'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { subscribeToAuthChanges } from '@rednexus/api';
import { useUserStore } from '@rednexus/store';

const AuthContext = createContext({
  user: null,
  role: null,
  isAuthenticated: false,
  isLoading: true,
});

export const AuthProvider = ({ children }) => {
  const { user, role, isAuthenticated, isLoading, setUser, setLoading } = useUserStore();

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((firebaseUser, profile) => {
      if (firebaseUser) {
        setUser(firebaseUser, profile);
      } else {
        setUser(null, null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return (
    <AuthContext.Provider value={{ user, role, isAuthenticated, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
