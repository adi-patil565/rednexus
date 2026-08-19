'use client';

import React from 'react';
import { useUserStore } from '@rednexus/store';
import { signOutFirebase } from '@rednexus/api';

export default function DashboardView({ onLogout }) {
  const { name, email, role, institution, donorProfile, clearUser } = useUserStore();

  const handleSignOut = async () => {
    try {
      await signOutFirebase();
      clearUser();
      if (onLogout) onLogout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header Bar */}
      <header style={styles.header}>
        <div style={styles.logo}>🩸 Raktasetu Dashboard</div>
        <div style={styles.userSection}>
          <div style={styles.roleBadge}>{role ? role.replace('_', ' ') : 'USER'}</div>
          <span style={styles.userName}>{name || email}</span>
          <button style={styles.logoutButton} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={styles.main}>
        <div style={styles.welcomeBanner}>
          <h2>Welcome back, {name || 'User'}!</h2>
          <p>Role: <strong>{role}</strong> | Logged in as: {email}</p>
        </div>

        {/* Donor View */}
        {(role === 'DONOR' || role === 'RECEIVER') && donorProfile && (
          <div style={styles.grid}>
            <div style={styles.card}>
              <h3>🩸 Blood Group Profile</h3>
              <p style={styles.statValue}>{donorProfile.bloodGroup}</p>
              <p style={styles.statLabel}>Eligibility Status: <strong>{donorProfile.status}</strong></p>
              {donorProfile.status === 'PENDING_REVIEW' && (
                <div style={styles.warningAlert}>
                  ⚠️ Account flagged for human medical review by blood bank staff before entering targeting pool.
                </div>
              )}
            </div>

            <div style={styles.card}>
              <h3>📍 Location & Preferences</h3>
              <p>Pincode: <strong>{donorProfile.pincode}</strong></p>
              <p>Donation Type: <strong>{donorProfile.donationType}</strong></p>
              <p>Thalassemia Flag: <strong>{donorProfile.hasThalassemia ? 'Yes' : 'No'}</strong></p>
            </div>
          </div>
        )}

        {/* Blood Bank / Hospital Staff View */}
        {role === 'BLOOD_BANK_STAFF' && institution && (
          <div style={styles.grid}>
            <div style={styles.card}>
              <h3>🏥 Institution Profile</h3>
              <p style={styles.statValue}>{institution.name}</p>
              <p>Category: <strong>{institution.category}</strong></p>
              {institution.linkedHospitalName && (
                <p>Linked Hospital: <strong>{institution.linkedHospitalName}</strong></p>
              )}
              <div style={institution.verificationStatus === 'VERIFIED' ? styles.successBadge : styles.warningBadge}>
                Status: {institution.verificationStatus}
              </div>
            </div>

            <div style={styles.card}>
              <h3>📊 Daily Usage Reporting (T1) & Thresholds (T3)</h3>
              <p style={styles.cardText}>Submit daily units issued per blood group to compute consumption rate and draft human-confirmed thresholds.</p>
              <button style={styles.actionButton}>Report Daily Usage</button>
            </div>
          </div>
        )}

        {/* Platform Admin View */}
        {role === 'PLATFORM_ADMIN' && (
          <div style={styles.grid}>
            <div style={styles.card}>
              <h3>🛡️ Platform Admin Panel</h3>
              <p style={styles.cardText}>Review & approve blood bank / hospital staff registration requests.</p>
              <button style={styles.actionButton}>Verify Institutions</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0F0C20',
    color: '#F5F5F5',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 32px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  logo: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#EF5350',
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  roleBadge: {
    background: 'rgba(21, 101, 192, 0.2)',
    border: '1px solid #1565C0',
    color: '#64B5F6',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '700',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '500',
  },
  logoutButton: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#FFF',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  main: {
    padding: '32px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  welcomeBanner: {
    background: 'linear-gradient(90deg, rgba(198,40,40,0.2) 0%, rgba(21,101,192,0.2) 100%)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '32px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '24px',
  },
  statValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#EF5350',
    margin: '12px 0',
  },
  statLabel: {
    fontSize: '14px',
    color: '#BDBDBD',
  },
  cardText: {
    fontSize: '14px',
    color: '#BDBDBD',
    lineHeight: '1.5',
    marginBottom: '16px',
  },
  actionButton: {
    background: '#C62828',
    color: '#FFF',
    border: 'none',
    padding: '10px 18px',
    borderRadius: '6px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  warningAlert: {
    marginTop: '12px',
    padding: '10px',
    background: 'rgba(255, 202, 40, 0.1)',
    border: '1px solid #FFCA28',
    color: '#FFCA28',
    fontSize: '12px',
    borderRadius: '6px',
  },
  successBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    background: 'rgba(46, 125, 50, 0.2)',
    border: '1px solid #2E7D32',
    color: '#81C784',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    marginTop: '12px',
  },
  warningBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    background: 'rgba(255, 202, 40, 0.2)',
    border: '1px solid #FFCA28',
    color: '#FFCA28',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    marginTop: '12px',
  },
};
