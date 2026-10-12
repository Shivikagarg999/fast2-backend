const mongoose = require('mongoose');

const scheduledNotificationSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: { type: String, enum: ['all', 'user'], required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetLabel: { type: String, default: '' },

    // 'once' fires a single time at `sendAt`. 'weekly' fires on each weekday in
    // `daysOfWeek` at `time` (IST, "HH:mm"), from `startDate` until `endDate`
    // (or indefinitely if `endDate` is null).
    scheduleType: { type: String, enum: ['once', 'weekly'], required: true },
    sendAt: { type: Date },
    daysOfWeek: { type: [Number], default: undefined }, // 0=Sun..6=Sat
    time: { type: String }, // "HH:mm", IST
    startDate: { type: Date },
    endDate: { type: Date, default: null },

    status: { type: String, enum: ['active', 'paused', 'completed', 'cancelled'], default: 'active' },
    nextRunAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
    sendCount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

scheduledNotificationSchema.index({ status: 1, nextRunAt: 1 });
scheduledNotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.models.ScheduledNotification || mongoose.model('ScheduledNotification', scheduledNotificationSchema);
