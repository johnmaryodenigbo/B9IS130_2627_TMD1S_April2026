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

  // Email alerts
  // MAIL_TRANSPORT: smtp (real SMTP server), log (print emails to the console), memory (tests)
  mailTransport: process.env.MAIL_TRANSPORT || (process.env.SMTP_HOST ? 'smtp' : 'log'),
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: Number(process.env.SMTP_PORT) || 1025,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  alertFrom: process.env.ALERT_FROM || 'ZOps Alerts <alerts@zops.local>',
  appUrl: process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173', // links in emails
  // Don't email again for the same monitor if it went down within this many minutes (flapping)
  alertCooldownMinutes: Number(process.env.ALERT_COOLDOWN_MINUTES ?? 5),
  // Re-send the DOWN email every N minutes while unacknowledged (0 = never)
  alertReminderMinutes: Number(process.env.ALERT_REMINDER_MINUTES ?? 60),
  // HTTP email APIs (for hosts that block SMTP ports, e.g. Render's free tier)
  brevoApiKey: process.env.BREVO_API_KEY || '',
  resendApiKey: process.env.RESEND_API_KEY || '',

  // User problem reports ("I have a problem" button on the public dashboard)
  reportWindowMinutes: Number(process.env.REPORT_WINDOW_MINUTES) || 15,   // window compared against the baseline
  reportMinCount: Number(process.env.REPORT_MIN_COUNT) || 3,              // never flag fewer reports than this
  reportSpikeFactor: Number(process.env.REPORT_SPIKE_FACTOR) || 3,        // ...or fewer than N x the usual level
  reportCooldownMinutes: Number(process.env.REPORT_COOLDOWN_MINUTES) || 10, // one report per visitor per monitor
  reportAlertCooldownMinutes: Number(process.env.REPORT_ALERT_COOLDOWN_MINUTES ?? 60),
  reportRetentionDays: Number(process.env.REPORT_RETENTION_DAYS) || 30,

  // SSL certificate expiry (https monitors)
  sslCheckHours: Number(process.env.SSL_CHECK_HOURS) || 12,           // re-read the certificate this often
  sslAlertDays: (process.env.SSL_ALERT_DAYS || '30,14,7,3,1')          // email when days left reach each of these
    .split(',').map(Number).filter((n) => n > 0).sort((a, b) => b - a),

  // Visitor email subscriptions (status page "Get notified")
  subscriptionsEnabled: process.env.SUBSCRIPTIONS_ENABLED !== 'false',

  // Deployment
  // Behind a proxy/load balancer (Render, Heroku, NGINX): number of proxy hops to trust for req.ip
  trustProxy: process.env.TRUST_PROXY ? (Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY) : false,
  // Serve the built React app (client/dist) from Express: one service hosts frontend + API
  serveClient: process.env.SERVE_CLIENT === 'true',
};
