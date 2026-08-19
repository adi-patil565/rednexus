import express from 'express';
import cors from 'cors';
import { moduleLogger } from './lib/logger.js';
import { verifyFirebaseToken } from './middleware/authMiddleware.js';
import donorRoutes from './routes/donor.routes.js';
import usageRoutes from './routes/usage.routes.js';
import thresholdRoutes from './routes/threshold.routes.js';
import authRoutes from './routes/auth.routes.js';
import donationRoutes from './routes/donation.routes.js';
import requestRoutes from './routes/request.routes.js';
import adminRoutes from './routes/admin.routes.js';
import campRoutes from './routes/camp.routes.js';

const log = moduleLogger('http');

const app = express();


app.use(cors());
app.use(express.json());

// ==========================================
// Health Check Endpoint (Phase 0 requirement)
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Raktasetu Core API',
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// REAL routes — backed by Postgres via Prisma.
//
// Everything below this block is still a hardcoded mock from the
// CLAUDE.md section 5.1 route blueprint. Routes graduate up here as
// they are implemented against the database.
// ==========================================
app.use('/api/donors', donorRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/thresholds', thresholdRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/camps', campRoutes);

// ==========================================
// 1. Authentication & Profile APIs (/api/auth)  [MOCK]
// ==========================================

// Register Donor/Receiver user account
app.post('/api/auth/register/user', (req, res) => {
  const { email, password, name, phone, role, bloodGroup, pincode, gender, dob, hasThalassemia, advisedNotToDonate } = req.body;
  console.log('[Auth] User Signup:', { email, name, role, bloodGroup, hasThalassemia, advisedNotToDonate });
  res.status(201).json({
    message: 'User registered successfully',
    user: { email, name, role, bloodGroup, pincode, status: advisedNotToDonate ? 'PENDING_REVIEW' : 'ACTIVE' },
  });
});

// Register Blood Bank / Hospital Staff account
app.post('/api/auth/register/blood-bank', (req, res) => {
  const { email, password, name, phone, institutionName, category, pincode, linkedHospitalName } = req.body;
  console.log('[Auth] Blood Bank Staff Signup:', { email, name, institutionName, category, pincode });
  res.status(201).json({
    message: 'Blood bank registered successfully',
    institution: { name, institutionName, category, verificationStatus: 'UNVERIFIED' },
  });
});

// Login User / Blood Bank Staff
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  console.log('[Auth] User Login:', email);
  res.json({
    message: 'Logged in successfully',
    token: 'mock-jwt-token',
    email,
  });
});

// Google OAuth Register/Login
app.post('/api/auth/google', (req, res) => {
  const { idToken, selectedRole, extraData } = req.body;
  console.log('[Auth] Google OAuth Login:', { selectedRole, extraData });
  res.json({
    message: 'User authenticated with Google successfully',
    selectedRole,
  });
});

// Get current user profile
app.get('/api/auth/me', verifyFirebaseToken, (req, res) => {
  const { uid, email } = req.user;
  res.json({
    uid,
    email,
    message: 'Authenticated user profile retrieved',
  });
});


// ==========================================
// 2. User (Donor/Receiver) APIs (/api/user)
// ==========================================

// Filtered Blood Banks list (by location, pincode, category, bloodGroup)
app.get('/api/user/bloodbanks', (req, res) => {
  const { pincode, bloodGroup, category } = req.query;
  console.log('[User] Filter bloodbanks:', { pincode, bloodGroup, category });
  res.json({
    filters: { pincode, bloodGroup, category },
    results: [
      { id: 'mgm_kamothe', name: 'MGM Hospital Blood Bank', address: 'Kamothe, Navi Mumbai', category: 'IN_HOUSE', pincode: '410209' },
      { id: 'fortis_vashi', name: 'Fortis Hiranandani Blood Bank', address: 'Vashi, Navi Mumbai', category: 'EXTERNAL', pincode: '400703' },
    ],
  });
});

// Real-time blood availability search
app.get('/api/user/blood-availability', (req, res) => {
  const { bloodGroup, pincode } = req.query;
  console.log('[User] Search blood availability:', { bloodGroup, pincode });
  res.json({
    bloodGroup: bloodGroup || 'O+',
    pincode: pincode || '400001',
    availability: [
      { bloodBank: 'MGM Hospital Blood Bank', wholeBlood: 30, prbc: 60, ffp: 85, platelets: 24 },
      { bloodBank: 'Fortis Hiranandani Blood Bank', wholeBlood: 25, prbc: 55, ffp: 60, platelets: 18 },
    ],
  });
});

// Donation Registration Form (saves to DB + Google Sheet sync)
app.post('/api/user/donation-registration', (req, res) => {
  const { campId, donorName, bloodGroup, phone, areaPincode, preferredTime, googleSheetSync } = req.body;
  console.log('[User] Donation registration submitted:', { campId, donorName, bloodGroup, googleSheetSync });
  res.status(201).json({
    message: 'Donation registration submitted successfully (Synced with DB & Google Sheet)',
    registrationId: `REG-${Date.now()}`,
    details: { donorName, bloodGroup, campId },
  });
});

// Monthly Camps & Drives Calendar
app.get('/api/user/camps/calendar', (req, res) => {
  const { month = 8, year = 2026, pincode } = req.query;
  console.log('[User] Get camps calendar:', { month, year, pincode });
  res.json({
    month: Number(month),
    year: Number(year),
    camps: [
      { id: 'c1', title: 'MGM Campus Drive', day: 5, month: 8, year: 2026, location: 'MGM Campus, Kamothe', organizer: 'MGM Hospital' },
      { id: 'c2', title: 'Kharghar Station Camp', day: 14, month: 8, year: 2026, location: 'Kharghar Station', organizer: 'MGM Hospital' },
      { id: 'c3', title: 'Inorbit Mall Drive', day: 18, month: 8, year: 2026, location: 'Inorbit Mall, Vashi', organizer: 'Fortis Hiranandani' },
    ],
  });
});

// Mark "I'll attend" for a camp
app.post('/api/user/camps/:id/attend', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  console.log('[User] Camp attendance marked:', { campId: id, userId });
  res.json({
    message: `Attendance confirmed for camp ${id}`,
    campId: id,
    status: 'ATTENDING',
  });
});

// User Notifications list
app.get('/api/user/notifications', (req, res) => {
  res.json({
    notifications: [
      { id: 'n1', title: 'Eligible to Donate', message: 'You are now eligible to donate blood!', date: new Date().toISOString(), read: false },
      { id: 'n2', title: 'Urgent Request Nearby', message: 'Urgent O+ blood needed at MGM Hospital.', date: new Date().toISOString(), read: false },
    ],
  });
});

// Mark Notification as read
app.put('/api/user/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  res.json({ message: `Notification ${id} marked as read`, id, read: true });
});

// Request an on-demand blood donation
app.post('/api/user/on-demand-request', (req, res) => {
  const { bloodGroup, unitsNeeded, hospitalName, pincode, urgency, patientName, contactPhone } = req.body;
  console.log('[User] On-demand request created:', { bloodGroup, unitsNeeded, hospitalName, urgency });
  res.status(201).json({
    message: 'On-demand blood request submitted successfully',
    requestId: `REQ-${Date.now()}`,
    status: 'RAISED',
    details: { bloodGroup, unitsNeeded, hospitalName, urgency },
  });
});

// View submitted on-demand requests
app.get('/api/user/my-requests', (req, res) => {
  res.json({
    requests: [
      { id: 'REQ-101', bloodGroup: 'O+', unitsNeeded: 2, status: 'RAISED', hospitalName: 'MGM Hospital', createdAt: new Date().toISOString() },
    ],
  });
});


// ==========================================
// 3. Blood Banks / Hospitals APIs (/api/blood-bank)
// ==========================================

// Track current blood inventory & stock levels
app.get('/api/blood-bank/stock', (req, res) => {
  res.json({
    institutionId: 'mgm_kamothe',
    stock: {
      wholeBlood: { A_pos: 15, B_pos: 22, O_pos: 30, AB_pos: 8, Negatives: 5 },
      prbc: { A_pos: 40, B_pos: 45, O_pos: 60, AB_pos: 12, Negatives: 8 },
      ffp: 85,
      platelets: 24,
    },
    thresholdBreaches: [{ bloodGroup: 'AB_neg', currentStock: 1, confirmedThreshold: 5, status: 'DETECTED' }],
  });
});

// Update blood stock inventory
app.put('/api/blood-bank/stock/update', (req, res) => {
  const { category, bloodGroup, units } = req.body;
  console.log('[BloodBank] Stock update:', { category, bloodGroup, units });
  res.json({
    message: 'Stock updated successfully',
    updated: { category, bloodGroup, units },
  });
});

// Submit daily usage report (T1 feed for computing threshold targets)
app.post('/api/blood-bank/usage-report', (req, res) => {
  const { date, usageData } = req.body;
  console.log('[BloodBank] Daily usage report submitted:', { date, usageData });
  res.status(201).json({
    message: 'Daily usage report recorded successfully',
    date: date || new Date().toISOString().split('T')[0],
    usageData,
  });
});

// Raise institution-mediated on-demand blood request
app.post('/api/blood-bank/on-demand-request', (req, res) => {
  const { bloodGroup, unitsNeeded, urgency, patientName, reason } = req.body;
  console.log('[BloodBank] Institution on-demand request raised:', { bloodGroup, unitsNeeded, urgency });
  res.status(201).json({
    message: 'On-demand request raised by blood bank',
    requestId: `BB-REQ-${Date.now()}`,
    origin: 'MANUAL',
    status: 'RAISED',
  });
});

// Get incoming on-demand requests
app.get('/api/blood-bank/incoming-requests', (req, res) => {
  res.json({
    incomingRequests: [
      { id: 'REQ-101', patientName: 'Rahul Verma', bloodGroup: 'O+', unitsNeeded: 2, urgency: 'HIGH', status: 'PENDING' },
    ],
  });
});

// Handle (Approve / Fulfill / Reject) incoming request
app.put('/api/blood-bank/requests/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body; // 'APPROVED' | 'FULFILLED' | 'REJECTED'
  console.log('[BloodBank] Handle request status:', { requestId: id, status, notes });
  res.json({
    message: `Request ${id} updated to ${status}`,
    requestId: id,
    status,
    notes,
  });
});

// Create and publish a new camp / drive
app.post('/api/blood-bank/camps', (req, res) => {
  const { title, date, location, pincode, capacity, notes } = req.body;
  console.log('[BloodBank] New camp posted:', { title, date, location, pincode });
  res.status(201).json({
    message: 'Donation camp published successfully',
    campId: `CAMP-${Date.now()}`,
    camp: { title, date, location, pincode, capacity, notes },
  });
});

// Human-in-the-loop threshold confirmation (T3)
app.post('/api/blood-bank/thresholds/confirm', (req, res) => {
  const { thresholdId, bloodGroup, confirmedThreshold, collectionTarget } = req.body;
  console.log('[BloodBank] Threshold confirmed by staff:', { bloodGroup, confirmedThreshold, collectionTarget });
  res.json({
    message: `Threshold for ${bloodGroup} confirmed successfully`,
    threshold: { bloodGroup, confirmedThreshold, collectionTarget, confirmedAt: new Date().toISOString() },
  });
});


// Central error handler. Must be last: Express identifies it by arity.
app.use((err, req, res, _next) => {
  log.error({ path: req.path, message: err.message }, 'Unhandled error');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  });
});

export default app;
