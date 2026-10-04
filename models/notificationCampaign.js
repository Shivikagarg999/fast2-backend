const mongoose = require('mongoose');

const notificationCampaignSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    audience: { type: String, enum: ['all', 'user'], required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetLabel: { type: String, default: '' },
    recipientCount: { type: Number, default: 0 },
    pushSent: { type: Number, default: 0 },
    pushFailed: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

notificationCampaignSchema.index({ createdAt: -1 });

module.exports = mongoose.models.NotificationCampaign || mongoose.model('NotificationCampaign', notificationCampaignSchema);
