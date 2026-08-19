// Firebase Web SDK — identity only.
//
// Firebase answers exactly one question: "who is this person?"
// It never answers "what may they do?" — role, institution, and
// verification status all live in Postgres and are enforced by the
// Express API. See CLAUDE.md Rules section 1.
//
// Config comes from the environment. There are no hardcoded fallbacks:
// a missing value should fail loudly at startup, not silently point a
// developer at the production Firebase project.

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missing = REQUIRED_KEYS.filter((key) => !firebaseConfig[key]);

if (missing.length > 0) {
  throw new Error(
    `Firebase config incomplete. Missing: ${missing.join(', ')}.\n` +
      'Copy .env.example to apps/web/.env.local and fill in the ' +
      'NEXT_PUBLIC_FIREBASE_* values from the Firebase console.'
  );
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// TODO(Stage 3.6): remove once Postgres is the system of record.
// Firestore is being retired — no new reads or writes should be added.
export const db = getFirestore(app);

export default app;
