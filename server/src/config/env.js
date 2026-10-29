import 'dotenv/config';

const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length && process.env.NODE_ENV !== 'test') {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5050,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Monitoring worker
  workerEnabled: process.env.WORKER_ENABLED !== 'false',         // run the worker inside the API process
  workerTickMs: Number(process.env.WORKER_TICK_MS) || 5000,       // how often to look for due monitors
  workerConcurrency: Number(process.env.WORKER_CONCURRENCY) || 10, // max checks running at once
  failureThreshold: Number(process.env.FAILURE_THRESHOLD) || 2,    // failed checks in a row before "down"
  checkRetentionDays: Number(process.env.CHECK_RETENTION_DAYS) || 90,
};
