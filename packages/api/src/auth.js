import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Register a user with Firebase Auth & store role profile in Firestore
 */
export const signUpWithFirebase = async (email, password, role, profileData) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Base user document schema
    const userDoc = {
      uid: user.uid,
      email: user.email,
      name: profileData.name || '',
      phone: profileData.phone || '',
      role: role, // 'DONOR' | 'RECEIVER' | 'BLOOD_BANK_STAFF' | 'PLATFORM_ADMIN'
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Role-specific extensions
    if (role === 'DONOR' || role === 'RECEIVER') {
      const isPendingReview = Boolean(profileData.advisedNotToDonate);
      userDoc.donorProfile = {
        bloodGroup: profileData.bloodGroup,
        pincode: profileData.pincode,
        gender: profileData.gender,
        dob: profileData.dob,
        donationType: profileData.donationType || 'VOLUNTARY',
        patientName: profileData.patientName || null,
        advisedNotToDonate: isPendingReview,
        hasThalassemia: Boolean(profileData.hasThalassemia),
        status: isPendingReview ? 'PENDING_REVIEW' : 'ACTIVE',
        lastDonationDate: profileData.lastDonationDate || null,
      };
    } else if (role === 'BLOOD_BANK_STAFF') {
      userDoc.institution = {
        name: profileData.institutionName,
        category: profileData.category || 'IN_HOUSE', // 'IN_HOUSE' | 'EXTERNAL'
        linkedHospitalName: profileData.linkedHospitalName || null,
        pincode: profileData.pincode,
        verificationStatus: 'UNVERIFIED', // Needs admin approval per CLAUDE.md
      };
    } else if (role === 'PLATFORM_ADMIN') {
      userDoc.adminAccess = true;
    }

    // Save profile to appropriate Firestore collection based on role
    const targetCollection = role === 'BLOOD_BANK_STAFF' ? 'blood_banks' : 'users';
    await setDoc(doc(db, targetCollection, user.uid), userDoc);

    return { user, profile: userDoc };
  } catch (error) {
    console.error('Firebase SignUp Error:', error);
    throw error;
  }
};

/**
 * Log in an existing user via Firebase Auth
 */
export const signInWithFirebase = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const profile = await fetchUserProfile(user.uid);
    return { user, profile };
  } catch (error) {
    console.error('Firebase SignIn Error:', error);
    throw error;
  }
};

/**
 * Sign in or Sign up with Google Auth via Firebase
 */
export const signInWithGoogle = async (selectedRole = 'DONOR', extraData = {}) => {
  try {
    const userCredential = await signInWithPopup(auth, googleProvider);
    const user = userCredential.user;

    // Check if profile already exists in Firestore (users or blood_banks)
    let profile = await fetchUserProfile(user.uid);

    if (!profile) {
      // First-time Google user: create profile document in appropriate collection
      profile = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || extraData.name || '',
        phone: user.phoneNumber || extraData.phone || '',
        photoURL: user.photoURL || null,
        role: selectedRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (selectedRole === 'DONOR' || selectedRole === 'RECEIVER') {
        profile.donorProfile = {
          bloodGroup: extraData.bloodGroup || 'O+',
          pincode: extraData.pincode || '400001',
          gender: extraData.gender || 'male',
          dob: extraData.dob || '',
          donationType: 'VOLUNTARY',
          status: 'ACTIVE',
        };
      } else if (selectedRole === 'BLOOD_BANK_STAFF') {
        profile.institution = {
          name: extraData.institutionName || 'City Blood Bank',
          category: extraData.category || 'IN_HOUSE',
          pincode: extraData.pincode || '400001',
          verificationStatus: 'UNVERIFIED',
        };
      } else if (selectedRole === 'PLATFORM_ADMIN') {
        profile.adminAccess = true;
      }

      const targetCollection = selectedRole === 'BLOOD_BANK_STAFF' ? 'blood_banks' : 'users';
      await setDoc(doc(db, targetCollection, user.uid), profile);
    }

    return { user, profile };
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
};

/**
 * Log out current Firebase user
 */
export const signOutFirebase = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Firebase SignOut Error:', error);
    throw error;
  }
};

/**
 * Fetch full user profile from Firestore by checking 'users' then 'blood_banks'
 */
export const fetchUserProfile = async (uid) => {
  try {
    // 1. Check 'users' collection (Donors / Receivers / Admins)
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      return userSnap.data();
    }

    // 2. Check 'blood_banks' collection (Blood Bank / Hospital Staff)
    const bloodBankDocRef = doc(db, 'blood_banks', uid);
    const bloodBankSnap = await getDoc(bloodBankDocRef);
    if (bloodBankSnap.exists()) {
      return bloodBankSnap.data();
    }

    // Self-healing: If user exists in Firebase Auth but profile was deleted in both collections
    if (auth.currentUser && auth.currentUser.uid === uid) {
      console.warn(`[Firestore Recovery] Profile document missing for UID: ${uid}. Auto-recreating profile in Firestore...`);
      const fallbackProfile = {
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || '',
        name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'User',
        phone: auth.currentUser.phoneNumber || '',
        role: 'DONOR', // Default fallback role
        donorProfile: {
          bloodGroup: 'O+',
          pincode: '400001',
          gender: 'male',
          status: 'ACTIVE',
          donationType: 'VOLUNTARY',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userDocRef, fallbackProfile);
      return fallbackProfile;
    }

    return null;
  } catch (error) {
    console.error('Fetch User Profile Error:', error);
    throw error;
  }
};

/**
 * Subscribe to Firebase auth state changes
 */
export const subscribeToAuthChanges = (callback) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await fetchUserProfile(user.uid);
      callback(user, profile);
    } else {
      callback(null, null);
    }
  });
};
