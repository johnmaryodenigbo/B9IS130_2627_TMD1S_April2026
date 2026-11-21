import mongoose from 'mongoose';

export async function connectDB(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    appName: 'zops-api',
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    autoIndex: process.env.NODE_ENV !== 'production'
  });
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
}

// In production autoIndex is off, so build indexes explicitly once at startup
// (unique emails, TTL clean-up of old checks/reports, one open incident per monitor).
export async function ensureIndexes() {
  if (process.env.NODE_ENV !== 'production') return;
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).createIndexes()));
  console.log('MongoDB indexes ensured');
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
