const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
    visitorId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true },
    event: { type: String, required: true },
    path: { type: String, default: '' },
    // Small event-specific details: { productRef, categoryRef, query, ... }
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    device: { type: String, enum: ['mobile', 'tablet', 'desktop'], default: 'desktop' },
    isLoggedIn: { type: Boolean, default: false },
    referrer: { type: String, default: '' },
    pincode: { type: String, default: '', index: true },
    area: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

analyticsEventSchema.index({ event: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: -1 });
// Keep raw events for 180 days; the dashboard only needs recent history.
analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', analyticsEventSchema);
