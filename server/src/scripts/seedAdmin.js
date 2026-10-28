// Creates the first admin account from ADMIN_* env vars. Safe to run more than once.
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { ROLES } from '../utils/roles.js';

const { ADMIN_NAME = 'Super Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

async function run() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env first');
  }
  await connectDB(env.mongoUri);

  const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) {
    console.log(`User ${existing.email} already exists (role: ${existing.role}). Nothing to do.`);
  } else {
    const admin = await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: ROLES.ADMIN });
    console.log(`Admin created: ${admin.email}. Log in and change the password.`);
  }
  await disconnectDB();
}

run().catch(async (err) => {
  console.error(err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
