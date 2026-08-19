import { z } from 'zod';

export const USER_ROLES = ['DONOR', 'RECEIVER', 'BLOOD_BANK_STAFF', 'PLATFORM_ADMIN'];
export const INSTITUTION_CATEGORIES = ['IN_HOUSE', 'EXTERNAL'];

// Donor & Receiver Signup Schema
export const donorSignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number (10 digits starting with 6-9)'),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  gender: z.enum(['male', 'female', 'other']),
  dob: z.string().min(1, 'Date of birth is required'),
  donationType: z.enum(['VOLUNTARY', 'REPLACEMENT']).default('VOLUNTARY'),
  patientName: z.string().optional(),
  advisedNotToDonate: z.boolean().default(false),
  hasThalassemia: z.boolean().default(false),
});

// Hospital & Blood Bank Staff Signup Schema
export const hospitalSignupSchema = z.object({
  name: z.string().min(2, 'Contact person name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  institutionName: z.string().min(3, 'Blood bank or hospital name is required'),
  category: z.enum(['IN_HOUSE', 'EXTERNAL']),
  linkedHospitalName: z.string().optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
});

// Admin Signup Schema
export const adminSignupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  adminSecret: z.string().min(4, 'Admin authorization code required'),
});

// Login Schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
