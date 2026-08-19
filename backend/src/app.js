import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isProduction } from './config/env.js';
import { moduleLogger } from './lib/logger.js';
import { globalLimiter } from './middleware/rateLimits.js';
import { verifyFirebaseToken } from './middleware/authMiddleware.js';
import donorRoutes from './routes/donor.routes.js';
import usageRoutes from './routes/usage.routes.js';
import thresholdRoutes from './routes/threshold.routes.js';
import authRoutes from './routes/auth.routes.js';
import donationRoutes from './routes/donation.routes.js';
import requestRoutes from './routes/request.routes.js';
import adminRoutes from './routes/admin.routes.js';
import campRoutes from './routes/camp.routes.js';
import recurringRoutes from './routes/recurring.routes.js';
import historyRoutes from './routes/history.routes.js';
import institutionRoutes from './routes/institution.routes.js';

const log = moduleLogger('http');

const app = express();


// Behind a proxy in production (Render, Railway, Fly). Without this
// express-rate-limit keys every request to the proxy's address and one
// abusive client rate-limits everybody.
if (isProduction) app.set('trust proxy', 1);

// M2: security headers. crossOriginResourcePolicy is relaxed because
// the API is called from a different origin than it is served from.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// M1: CORS was wide open - every origin could drive this API with a
// stolen Bearer token. In production only the configured web origin is
// allowed; in development localhost is convenient and low-risk.
app.use(
  cors({
    origin: isProduction ? env.WEB_ORIGIN : true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // No cookies anywhere - auth is a Bearer token - so credentialed
    // cross-origin requests are refused rather than configured.
    credentials: false,
    maxAge: 86400,
  })
);

// M4: an explicit ceiling rather than relying on the framework default.
app.use(express.json({ limit: '100kb' }));

// H3: a broad ceiling. Tighter per-route limits sit on the routers.
app.use('/api/', globalLimiter);

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
// Routes. All backed by Postgres via Prisma.
//
// The CLAUDE.md section 5.1 blueprint originally landed here as 26
// hardcoded mocks. They are gone: every one either has a real
// implementation below, or described something deliberately not built.
// ==========================================
app.use('/api/donors', donorRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/thresholds', thresholdRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/camps', campRoutes);
app.use('/api/schedules', recurringRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/institutions', institutionRoutes);

// Central error handler. Must be last: Express identifies it by arity.
app.use((err, req, res, _next) => {
  log.error({ path: req.path, message: err.message }, 'Unhandled error');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  });
});

export default app;
