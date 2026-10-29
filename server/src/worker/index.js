// Standalone worker process: `npm run worker`.
// Use it when the API runs with WORKER_ENABLED=false, e.g. a separate Kubernetes Deployment.
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { createScheduler } from './scheduler.js';

async function start() {
  await connectDB(env.mongoUri);
  const scheduler = createScheduler({ tickMs: env.workerTickMs, concurrency: env.workerConcurrency });
  scheduler.start();

  const shutdown = async (signal) => {
    console.log(`${signal} received, stopping worker...`);
    await scheduler.stop();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
