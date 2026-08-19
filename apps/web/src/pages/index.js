'use client';

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext.js';
import { SignupView, LoginView, DashboardView } from '../views/index.js';

function MainApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState('signup'); // 'signup' | 'login' | 'dashboard'

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}>🩸</div>
        <p>Loading Raktasetu Platform...</p>
      </div>
    );
  }

  if (isAuthenticated || currentScreen === 'dashboard') {
    return <DashboardView onLogout={() => setCurrentScreen('login')} />;
  }

  if (currentScreen === 'login') {
    return (
      <LoginView
        onNavigateToSignup={() => setCurrentScreen('signup')}
        onLoginSuccess={() => setCurrentScreen('dashboard')}
      />
    );
  }

  return (
    <SignupView
      onNavigateToLogin={() => setCurrentScreen('login')}
      onSignupSuccess={() => setCurrentScreen('dashboard')}
    />
  );
}

export default function App() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}>🩸</div>
        <p>Initializing Platform...</p>
      </div>
    );
  }

  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

const styles = {
  loadingContainer: {
    minHeight: '100vh',
    background: '#0F0C20',
    color: '#FFF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', sans-serif",
  },
  spinner: {
    fontSize: '48px',
    animation: 'pulse 1.5s infinite',
    marginBottom: '16px',
  },
};
