import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';

/**
 * Seed sample profiles into Firestore across 'users' and 'blood_banks' collections
 */
export const seedSampleFirestoreUsers = async () => {
  const sampleItems = [
    {
      collection: 'users',
      data: {
        uid: 'sample_donor_001',
        email: 'donor@raktasetu.org',
        name: 'Dr. Rajesh Sharma',
        phone: '9876543210',
        role: 'DONOR',
        donorProfile: {
          bloodGroup: 'O+',
          pincode: '400001',
          gender: 'male',
          dob: '1990-05-15',
          donationType: 'VOLUNTARY',
          advisedNotToDonate: false,
          hasThalassemia: false,
          status: 'ACTIVE',
          lastDonationDate: null,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    {
      collection: 'blood_banks',
      data: {
        uid: 'sample_staff_001',
        email: 'staff@citybloodbank.org',
        name: 'Priya Patel',
        phone: '9812345678',
        role: 'BLOOD_BANK_STAFF',
        institution: {
          name: 'City Central Blood Bank',
          category: 'IN_HOUSE',
          linkedHospitalName: 'City General Hospital',
          pincode: '400001',
          verificationStatus: 'VERIFIED',
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    {
      collection: 'users',
      data: {
        uid: 'sample_admin_001',
        email: 'admin@raktasetu.org',
        name: 'System Admin',
        phone: '9900000000',
        role: 'PLATFORM_ADMIN',
        adminAccess: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
  ];

  for (const item of sampleItems) {
    await setDoc(doc(db, item.collection, item.data.uid), item.data);
  }

  console.log('[Firestore Seed] Sample users & blood banks populated into Firestore.');
  return sampleItems;
};
