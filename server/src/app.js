import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import monitorRoutes from './routes/monitor.routes.js';
import publicRoutes from './routes/public.routes.js';
import incidentRoutes from './routes/incident.routes.js';
import alertRoutes from './routes/alert.routes.js';
import subscriberRoutes from './routes/subscriber.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

// client/dist, built by `npm run build` in the client folder
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function createApp() {
  const app = express();

  // Behind Render/NGINX/a load balancer: trust X-Forwarded-For so req.ip is the visitor's IP
  // (used by rate limiting and user reports).
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.nodeEnv !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Public health check (also handy for Kubernetes probes).
  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down', uptime: process.uptime() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/monitors', monitorRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/incidents', incidentRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/subscribers', subscriberRoutes);

  // Production on one service: Express also serves the React app (same origin, so the
  // auth cookie and Socket.IO need no cross-site setup).
  if (env.serveClient && fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    // Any non-API GET returns index.html so React Router can handle /monitors, /on-call, ...
    app.get(/^(?!\/api\/|\/socket\.io\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
