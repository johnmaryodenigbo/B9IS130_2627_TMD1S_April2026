import mongoose from 'mongoose';

// One outage: opened when a monitor goes DOWN, resolved when it comes back UP.
const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['down', 'reminder', 'recovered'], required: true },
    sentAt: { type: Date, default: Date.now },
    recipients: [{ type: String }],
    ok: { type: Boolean, default: false },
    error: { type: String },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    monitor: { type: mongoose.Schema.Types.ObjectId, ref: 'Monitor', required: true },
    // Copied from the monitor so the history still makes sense if it is renamed or deleted
    monitorName: { type: String, required: true },
    environment: { type: String },
    isPublic: { type: Boolean, default: true },

    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    startedAt: { type: Date, required: true },
    resolvedAt: { type: Date },
    resolution: { type: String, enum: ['recovered', 'paused', 'reset', 'deleted'] },
    cause: { type: String }, // error from the check that marked it down

    acknowledgedAt: { type: Date },
    acknowledgedBy: { id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String },

    alertsSuppressed: { type: Boolean, default: false }, // flapping: went down again within the cooldown
    lastNotifiedAt: { type: Date },
    notifications: [notificationSchema],
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

incidentSchema.virtual('durationMs').get(function durationMs() {
  return (this.resolvedAt ?? new Date()).getTime() - this.startedAt.getTime();
});

// At most one open incident per monitor (also protects against two processes opening one at once).
incidentSchema.index({ monitor: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
incidentSchema.index({ startedAt: -1 });
incidentSchema.index({ status: 1, lastNotifiedAt: 1 });

export const Incident = mongoose.model('Incident', incidentSchema);
