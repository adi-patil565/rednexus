'use client';

import React, { useState } from 'react';
import { signInWithFirebase, signInWithGoogle } from '@rednexus/api';
import { loginSchema } from '@rednexus/validators';
import { useUserStore } from '@rednexus/store';

export default function LoginView({ onNavigateToSignup, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const validationResult = loginSchema.safeParse({ email, password });
      if (!validationResult.success) {
        const formatted = {};
        validationResult.error.errors.forEach((err) => {
          if (err.path[0]) formatted[err.path[0]] = err.message;
        });
        setFieldErrors(formatted);
        setIsSubmitting(false);
        return;
      }

      const { user, profile } = await signInWithFirebase(email, password);
      if (onLoginSuccess) onLoginSuccess(user, profile);
    } catch (err) {
      console.error('Login Failure:', err);
      setError(err.message || 'Invalid email or password credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleSubmitting(true);
    try {
      const { user, profile } = await signInWithGoogle();
      if (onLoginSuccess) onLoginSuccess(user, profile);
    } catch (err) {
      console.error('Google Sign-In Failure:', err);
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>🩸 Raktasetu</div>
          <h1 style={styles.title}>Welcome Back</h1>
          <p style={styles.subtitle}>Sign in to access your portal</p>
        </div>

        {error && <div style={styles.errorAlert}>⚠️ {error}</div>}

        {/* Google Sign-In Option */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleSubmitting}
          style={isGoogleSubmitting ? styles.disabledGoogleButton : styles.googleButton}
        >
          <svg style={styles.googleIcon} viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {isGoogleSubmitting ? 'Signing in with Google...' : 'Continue with Google'}
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerLine}></span>
          <span style={styles.dividerText}>or email sign in</span>
          <span style={styles.dividerLine}></span>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Email Address *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.org"
              style={fieldErrors.email ? styles.inputError : styles.input}
            />
            {fieldErrors.email && <span style={styles.errorText}>{fieldErrors.email}</span>}
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={fieldErrors.password ? styles.inputError : styles.input}
            />
            {fieldErrors.password && <span style={styles.errorText}>{fieldErrors.password}</span>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={isSubmitting ? styles.disabledButton : styles.primaryButton}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={styles.footer}>
          Don't have an account?{' '}
          <button style={styles.linkButton} onClick={onNavigateToSignup}>
            Create an Account
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1e1e2f 0%, #0f0c20 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    color: '#F5F5F5',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    padding: '40px',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '28px',
  },
  logoBadge: {
    display: 'inline-block',
    padding: '6px 14px',
    borderRadius: '20px',
    background: 'rgba(198, 40, 40, 0.2)',
    border: '1px solid #C62828',
    color: '#EF5350',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#BDBDBD',
    margin: 0,
  },
  googleButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.08)',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  disabledGoogleButton: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#757575',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'not-allowed',
  },
  googleIcon: {
    width: '18px',
    height: '18px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '20px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    fontSize: '12px',
    color: '#757575',
    textTransform: 'uppercase',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#E0E0E0',
  },
  input: {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: 'rgba(0, 0, 0, 0.25)',
    color: '#FFF',
    fontSize: '14px',
    outline: 'none',
  },
  inputError: {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #E53935',
    background: 'rgba(229, 57, 53, 0.1)',
    color: '#FFF',
    fontSize: '14px',
    outline: 'none',
  },
  errorAlert: {
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'rgba(229, 57, 53, 0.15)',
    border: '1px solid #E53935',
    color: '#FF8A80',
    fontSize: '13px',
    marginBottom: '20px',
  },
  errorText: {
    fontSize: '11px',
    color: '#FF8A80',
  },
  primaryButton: {
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(90deg, #C62828 0%, #B71C1C 100%)',
    color: '#FFF',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '8px',
    boxShadow: '0 4px 16px rgba(198, 40, 40, 0.4)',
  },
  disabledButton: {
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    background: '#424242',
    color: '#9E9E9E',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'not-allowed',
    marginTop: '8px',
  },
  footer: {
    textAlign: 'center',
    marginTop: '24px',
    fontSize: '14px',
    color: '#9E9E9E',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#64B5F6',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};
