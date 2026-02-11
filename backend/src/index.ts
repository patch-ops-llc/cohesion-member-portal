import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';

import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import fileRoutes from './routes/files';
import adminRoutes from './routes/admin';
import cardRoutes from './routes/cards';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Railway
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

// CORS configuration - HubSpot UIE requires app.hubspot.com / app-eu1.hubspot.com
const hubspotOrigins = [
  'https://app.hubspot.com',
  'https://app-eu1.hubspot.com',
  'https://app.hubspot.eu',
  'https://app-eu1.hubspot.eu'
];
const defaultOrigins = process.env.NODE_ENV === 'production'
  ? [...hubspotOrigins.filter(o => !o.includes('*')), 'https://cohesion-member-portal-production.up.railway.app']
  : ['http://localhost:5173'];
const corsOriginsList = process.env.CORS_ORIGINS?.split(',').map((o: string) => o.trim()).filter(Boolean) || defaultOrigins;
app.use(cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true);
    if (corsOriginsList.includes(origin)) return cb(null, true);
    if (origin.endsWith('.hubspot.com')) return cb(null, true);
    cb(null, false);
  },
  credentials: true
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cards', cardRoutes);

// Serve static files in production (for frontend)
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  
  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
