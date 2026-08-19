'use client';

import React, { useState } from 'react';
import { signUpWithFirebase, signInWithGoogle } from '@rednexus/api';
import { donorSignupSchema, hospitalSignupSchema, adminSignupSchema } from '@rednexus/validators';
import { useUserStore } from '@rednexus/store';

export default function SignupView({ onNavigateToLogin, onSignupSuccess }) {
  const [activeRole, setActiveRole] = useState('DONOR'); // 'DONOR' | 'BLOOD_BANK_STAFF' | 'PLATFORM_ADMIN'
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    bloodGroup: 'O+',
    pincode: '',
    gender: 'male',
    dob: '',
    donationType: 'VOLUNTARY',
    patientName: '',
    advisedNotToDonate: false,
    hasThalassemia: false,
    institutionName: '',
    category: 'IN_HOUSE',
    linkedHospitalName: '',
    adminSecret: '',
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: null }));
    setError('');
  };

  const handleRoleChange = (role) => {
    setActiveRole(role);
    setError('');
    setFieldErrors({});
    setSuccessInfo(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      let validationResult;
      if (activeRole === 'DONOR' || activeRole === 'RECEIVER') {
        validationResult = donorSignupSchema.safeParse(formData);
      } else if (activeRole === 'BLOOD_BANK_STAFF') {
        validationResult = hospitalSignupSchema.safeParse(formData);
      } else if (activeRole === 'PLATFORM_ADMIN') {
        validationResult = adminSignupSchema.safeParse(formData);
      }

      if (!validationResult.success) {
        const formatted = {};
        validationResult.error.errors.forEach((err) => {
          if (err.path[0]) formatted[err.path[0]] = err.message;
        });
        setFieldErrors(formatted);
        setIsSubmitting(false);
        return;
      }

      // Execute Firebase Auth Signup
      const { user, profile } = await signUpWithFirebase(
        formData.email,
        formData.password,
        activeRole,
        formData
      );

      // Determine notice status for human-in-the-loop audit
      let noticeMessage = 'Account created successfully!';
      if (activeRole === 'DONOR' && profile.donorProfile?.status === 'PENDING_REVIEW') {
        noticeMessage = 'Account registered as PENDING REVIEW. A blood bank staff member will review your medical advisement status before activating your targeting pool eligibility.';
      } else if (activeRole === 'BLOOD_BANK_STAFF') {
        noticeMessage = 'Blood bank / Hospital staff account registered! Status is UNVERIFIED pending verification by a Platform Admin.';
      }

      setSuccessInfo({ user, profile, message: noticeMessage });
      if (onSignupSuccess) onSignupSuccess(profile);
    } catch (err) {
      console.error('Signup Failure:', err);
      setError(err.message || 'Registration failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const { user, profile } = await signInWithGoogle(activeRole, formData);
      setSuccessInfo({
        user,
        profile,
        message: `Registered successfully with Google as ${activeRole.replace('_', ' ')}!`,
      });
      if (onSignupSuccess) onSignupSuccess(profile);
    } catch (err) {
      console.error('Google Sign-Up Error:', err);
      setError(err.message || 'Google registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>🩸 Raktasetu</div>
          <h1 style={styles.title}>Create Your Account</h1>
          <p style={styles.subtitle}>Consumption-Based Blood Supply Regularisation Platform</p>
        </div>

        {/* Role Selection Tabs */}
        <div style={styles.tabContainer}>
          <button
            type="button"
            style={activeRole === 'DONOR' ? styles.activeTab : styles.tab}
            onClick={() => handleRoleChange('DONOR')}
          >
            Donor / Receiver
          </button>
          <button
            type="button"
            style={activeRole === 'BLOOD_BANK_STAFF' ? styles.activeTab : styles.tab}
            onClick={() => handleRoleChange('BLOOD_BANK_STAFF')}
          >
            Blood Bank / Hospital
          </button>
          <button
            type="button"
            style={activeRole === 'PLATFORM_ADMIN' ? styles.activeTab : styles.tab}
            onClick={() => handleRoleChange('PLATFORM_ADMIN')}
          >
            Platform Admin
          </button>
        </div>

        {error && <div style={styles.errorAlert}>⚠️ {error}</div>}

        {/* Google Sign Up Button */}
        {!successInfo && (
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isSubmitting}
            style={{
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
              marginBottom: '16px',
            }}
          >
            <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Register with Google as {activeRole.replace('_', ' ')}
          </button>
        )}

        {successInfo ? (
          <div style={styles.successCard}>
            <div style={styles.successHeader}>✅ Registration Completed</div>
            <p style={styles.successMessage}>{successInfo.message}</p>
            <button style={styles.primaryButton} onClick={onNavigateToLogin}>
              Proceed to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            {/* Common Fields */}
            <div style={styles.row}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Full Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Dr. Rajesh Sharma"
                  style={fieldErrors.name ? styles.inputError : styles.input}
                />
                {fieldErrors.name && <span style={styles.errorText}>{fieldErrors.name}</span>}
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Mobile Number *</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="10-digit Indian mobile (e.g. 9876543210)"
                  style={fieldErrors.phone ? styles.inputError : styles.input}
                />
                {fieldErrors.phone && <span style={styles.errorText}>{fieldErrors.phone}</span>}
              </div>
            </div>

            <div style={styles.row}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Email Address *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@domain.org"
                  style={fieldErrors.email ? styles.inputError : styles.input}
                />
                {fieldErrors.email && <span style={styles.errorText}>{fieldErrors.email}</span>}
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.label}>Password *</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min 6 characters"
                  style={fieldErrors.password ? styles.inputError : styles.input}
                />
                {fieldErrors.password && <span style={styles.errorText}>{fieldErrors.password}</span>}
              </div>
            </div>

            {/* Role-Specific Fields: Donor / Receiver */}
            {(activeRole === 'DONOR' || activeRole === 'RECEIVER') && (
              <>
                <div style={styles.row}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Blood Group *</label>
                    <select
                      name="bloodGroup"
                      value={formData.bloodGroup}
                      onChange={handleChange}
                      style={styles.select}
                    >
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Pincode / Area *</label>
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      placeholder="6-digit pincode"
                      style={fieldErrors.pincode ? styles.inputError : styles.input}
                    />
                    {fieldErrors.pincode && <span style={styles.errorText}>{fieldErrors.pincode}</span>}
                  </div>
                </div>

                <div style={styles.row}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Gender *</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      style={styles.select}
                    >
                      <option value="male">Male (90-day interval)</option>
                      <option value="female">Female (120-day interval)</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Date of Birth *</label>
                    <input
                      type="date"
                      name="dob"
                      value={formData.dob}
                      onChange={handleChange}
                      style={fieldErrors.dob ? styles.inputError : styles.input}
                    />
                    {fieldErrors.dob && <span style={styles.errorText}>{fieldErrors.dob}</span>}
                  </div>
                </div>

                {/* Medical History Flags */}
                <div style={styles.checkboxSection}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      name="advisedNotToDonate"
                      checked={formData.advisedNotToDonate}
                      onChange={handleChange}
                      style={styles.checkbox}
                    />
                    Have you ever been advised NOT to donate blood before?
                  </label>
                  {formData.advisedNotToDonate && (
                    <div style={styles.infoNote}>
                      ℹ️ Selecting 'Yes' flags your account for human review by blood bank staff before entering the targeting pool.
                    </div>
                  )}

                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      name="hasThalassemia"
                      checked={formData.hasThalassemia}
                      onChange={handleChange}
                      style={styles.checkbox}
                    />
                    Do you or a family member have Thalassemia / periodic transfusion requirement?
                  </label>
                </div>
              </>
            )}

            {/* Role-Specific Fields: Blood Bank / Hospital */}
            {activeRole === 'BLOOD_BANK_STAFF' && (
              <>
                <div style={styles.row}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Institution Name *</label>
                    <input
                      type="text"
                      name="institutionName"
                      value={formData.institutionName}
                      onChange={handleChange}
                      placeholder="e.g. City Civil Hospital Blood Bank"
                      style={fieldErrors.institutionName ? styles.inputError : styles.input}
                    />
                    {fieldErrors.institutionName && (
                      <span style={styles.errorText}>{fieldErrors.institutionName}</span>
                    )}
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Institution Category *</label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      style={styles.select}
                    >
                      <option value="IN_HOUSE">IN_HOUSE (Embedded within hospital)</option>
                      <option value="EXTERNAL">EXTERNAL (Standalone regional centre)</option>
                    </select>
                  </div>
                </div>

                <div style={styles.row}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Linked Hospital Name (if In-House)</label>
                    <input
                      type="text"
                      name="linkedHospitalName"
                      value={formData.linkedHospitalName}
                      onChange={handleChange}
                      placeholder="e.g. AIIMS Delhi"
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label}>Institution Pincode *</label>
                    <input
                      type="text"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      placeholder="6-digit pincode"
                      style={fieldErrors.pincode ? styles.inputError : styles.input}
                    />
                    {fieldErrors.pincode && <span style={styles.errorText}>{fieldErrors.pincode}</span>}
                  </div>
                </div>
              </>
            )}

            {/* Role-Specific Fields: Platform Admin */}
            {activeRole === 'PLATFORM_ADMIN' && (
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Admin Authorization Secret *</label>
                <input
                  type="password"
                  name="adminSecret"
                  value={formData.adminSecret}
                  onChange={handleChange}
                  placeholder="Enter platform security code"
                  style={fieldErrors.adminSecret ? styles.inputError : styles.input}
                />
                {fieldErrors.adminSecret && <span style={styles.errorText}>{fieldErrors.adminSecret}</span>}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={isSubmitting ? styles.disabledButton : styles.primaryButton}
            >
              {isSubmitting ? 'Creating Account...' : `Register as ${activeRole.replace('_', ' ')}`}
            </button>
          </form>
        )}

        <div style={styles.footer}>
          Already have an account?{' '}
          <button style={styles.linkButton} onClick={onNavigateToLogin}>
            Sign In Here
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
    padding: '36px',
    width: '100%',
    maxWidth: '680px',
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
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#BDBDBD',
    margin: 0,
  },
  tabContainer: {
    display: 'flex',
    gap: '8px',
    background: 'rgba(0, 0, 0, 0.2)',
    padding: '6px',
    borderRadius: '10px',
    marginBottom: '24px',
  },
  tab: {
    flex: 1,
    padding: '10px',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    color: '#9E9E9E',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  activeTab: {
    flex: 1,
    padding: '10px',
    border: 'none',
    borderRadius: '8px',
    background: '#C62828',
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(198, 40, 40, 0.4)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  fieldGroup: {
    flex: 1,
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
  select: {
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    background: '#1A1A24',
    color: '#FFF',
    fontSize: '14px',
    outline: 'none',
  },
  checkboxSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginTop: '8px',
    background: 'rgba(0,0,0,0.15)',
    padding: '16px',
    borderRadius: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: '#E0E0E0',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#C62828',
    width: '16px',
    height: '16px',
  },
  infoNote: {
    fontSize: '12px',
    color: '#FFCA28',
    background: 'rgba(255, 202, 40, 0.1)',
    padding: '8px 12px',
    borderRadius: '6px',
    lineHeight: '1.4',
  },
  errorAlert: {
    padding: '12px 16px',
    borderRadius: '8px',
    background: 'rgba(229, 57, 53, 0.15)',
    border: '1px solid #E53935',
    color: '#FF8A80',
    fontSize: '13px',
    marginBottom: '16px',
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
    marginTop: '12px',
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
    marginTop: '12px',
  },
  successCard: {
    background: 'rgba(46, 125, 50, 0.15)',
    border: '1px solid #2E7D32',
    padding: '24px',
    borderRadius: '12px',
    textAlign: 'center',
  },
  successHeader: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#81C784',
    marginBottom: '8px',
  },
  successMessage: {
    fontSize: '14px',
    color: '#E0E0E0',
    lineHeight: '1.5',
    marginBottom: '16px',
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
