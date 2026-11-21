import { env } from './config/env.js';
import { connectDB, disconnectDB, ensureIndexes } from './config/db.js';
import { createApp } from './app.js';
import { createScheduler } from './worker/scheduler.js';
import { initRealtime } from './realtime/socket.js';
import { startChangeRelay } from './realtime/changeRelay.js';
import { startAlerting } from './services/alerts.js';
import { verifyMailer } from './services/mailer.js';

async function start() {
  await connectDB(env.mongoUri);
  const app = createApp();
  await ensureIndexes(); // after createApp() so every model is registered
  const server = app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Live updates for the dashboard (Socket.IO shares the API's port).
  const realtime = initRealtime(server);

  // The monitoring worker runs inside the API unless WORKER_ENABLED=false.
  const scheduler = env.workerEnabled
    ? createScheduler({ tickMs: env.workerTickMs, concurrency: env.workerConcurrency })
    : null;
  scheduler?.start();
  // Email alerts. Always on in the API ("check now" runs here); reminders run where the worker runs.
  const alerting = startAlerting({ reminders: env.workerEnabled });
  verifyMailer();

  // Worker in another process? Pick up its results from MongoDB instead.
  const relay = env.workerEnabled ? null : startChangeRelay();

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down...`);
    await scheduler?.stop();
    relay?.stop();
    alerting.stop();
    await realtime.close(); // also closes the HTTP server
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
