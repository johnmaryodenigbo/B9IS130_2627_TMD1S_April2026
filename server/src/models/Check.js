import mongoose from 'mongoose';
import { env } from '../config/env.js';

// The result of one ping of one monitor.
const checkSchema = new mongoose.Schema(
  {
    monitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true },
    checkedAt: { type: Date, default: Date.now },
    ok: { type: Boolean, required: true },        // true = response matched the expected status
    statusCode: { type: Number },                 // missing when the request never got a response
    responseTimeMs: { type: Number },
    error: { type: String },                      // e.g. "Timed out after 10s", "DNS lookup failed"
  },
  {
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  }
);

// Latest checks for a monitor (history, uptime).
checkSchema.index({ monitor: 1, checkedAt: -1 });
// MongoDB deletes old checks automatically (TTL index).
checkSchema.index({ checkedAt: 1 }, { expireAfterSeconds: env.checkRetentionDays * 24 * 60 * 60 });

export const Check = mongoose.model('Check', checkSchema);
