import mongoose from 'mongoose';
import { HTTP_METHODS, ENVIRONMENTS, MONITOR_STATUSES, LIMITS } from '../utils/monitorOptions.js';

// One application/endpoint in the inventory that ZOps will ping.
const monitorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    url: { type: String, required: true, trim: true },
    method: { type: String, enum: HTTP_METHODS, default: 'GET' },
    expectedStatus: { type: Number, min: 100, max: 599, default: 200 },
    intervalSeconds: {
      type: Number,
      min: LIMITS.intervalSeconds.min,
      max: LIMITS.intervalSeconds.max,
      default: LIMITS.intervalSeconds.default,
    },
    timeoutMs: {
      type: Number,
      min: LIMITS.timeoutMs.min,
      max: LIMITS.timeoutMs.max,
      default: LIMITS.timeoutMs.default,
    },
    environment: { type: String, enum: ENVIRONMENTS, default: 'production' },
    isActive: { type: Boolean, default: true },  // false = paused, the worker skips it
    isPublic: { type: Boolean, default: true },  // shown on the anonymous dashboard

    // Filled in by the monitoring worker in phase 3
    status: { type: String, enum: MONITOR_STATUSES, default: 'pending' },
    lastCheckedAt: { type: Date },
    lastStatusCode: { type: Number },
    lastResponseTimeMs: { type: Number },
    lastError: { type: String },
    consecutiveFailures: { type: Number, default: 0 },
    statusChangedAt: { type: Date },              // when it last went up/down (for "down since")
    nextCheckAt: { type: Date, default: Date.now }, // the worker picks up monitors whose time has come

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// The same name can exist once per environment (e.g. "Payments API" in production and staging).
monitorSchema.index({ name: 1, environment: 1 }, { unique: true });
monitorSchema.index({ isActive: 1, nextCheckAt: 1 });

// A request must time out before the next check is due.
monitorSchema.pre('validate', function checkTimeout() {
  if (this.timeoutMs >= this.intervalSeconds * 1000) {
    this.invalidate('timeoutMs', 'Timeout must be shorter than the check interval');
  }
});

export const Monitor = mongoose.model('Monitor', monitorSchema);
