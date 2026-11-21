import mongoose from 'mongoose';
import { env } from '../config/env.js';

export const REPORT_CATEGORIES = ['down', 'slow', 'login', 'errors', 'other'];

// One "I have a problem" click from a visitor on the public dashboard.
const reportSchema = new mongoose.Schema(
  {
    monitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true },
    category: { type: String, enum: REPORT_CATEGORIES, default: 'other' },
    // sha256(ip + secret): lets us stop repeat reports without storing anyone's IP address
    ipHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

reportSchema.index({ monitor: 1, createdAt: -1 });
reportSchema.index({ monitor: 1, ipHash: 1, createdAt: -1 });
// Old reports are deleted automatically.
reportSchema.index({ createdAt: 1 }, { expireAfterSeconds: env.reportRetentionDays * 24 * 60 * 60 });

export const Report = mongoose.model('Report', reportSchema);
