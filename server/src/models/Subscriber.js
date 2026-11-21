import mongoose from 'mongoose';

// A visitor who asked to be emailed about outages ("Get notified" on the status page).
const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Which public monitors to email about; empty = all of them
    monitors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Monitor' }],
    confirmed: { type: Boolean, default: false },
    confirmedAt: { type: Date },

    // Double opt-in: every sign-up (or change) waits for a click on the emailed link.
    pendingMonitors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Monitor' }],
    confirmTokenHash: { type: String, index: true },
    confirmSentAt: { type: Date },

    // Random token in every email's unsubscribe link (only lets someone unsubscribe this address).
    unsubscribeToken: { type: String, required: true, index: true },
  },
  { timestamps: true, versionKey: false }
);

// Sign-ups never confirmed are deleted after 7 days.
subscriberSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { confirmed: false } }
);

export const Subscriber = mongoose.model('Subscriber', subscriberSchema);
