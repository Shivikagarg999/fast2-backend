const cron = require('node-cron');
const User = require('../models/user');
const Order = require('../models/order');
const { sendNotification } = require('./notificationService');
const whatsappService = require('./whatsappService');

const INACTIVE_AFTER_DAYS = 14;
const WINBACK_COOLDOWN_DAYS = 14; // never message the same inactive customer more than once per window

const sendWinback = async (user) => {
    if (user.fcmToken) {
        try {
            await sendNotification(
                user._id,
                'We miss you! 💛',
                `Hi ${user.name || 'there'}, it's been a while! Come back and enjoy fresh groceries delivered fast on GMKart.`,
                'promo'
            );
        } catch (error) {
            console.error(`Win-back push failed for ${user._id}:`, error.message);
        }
    }

    if (user.phone) {
        try {
            await whatsappService.sendTemplate(user.phone, 'winback_reminder', 'en', [user.name || 'there']);
        } catch (error) {
            console.error(`Win-back WhatsApp failed for ${user._id}:`, error.message);
        }
    }
};

const sweep = async () => {
    const now = Date.now();
    const inactiveCutoff = new Date(now - INACTIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const cooldownCutoff = new Date(now - WINBACK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

    // Only target customers who have ordered before but gone quiet -- not
    // brand-new signups who simply haven't had time to place a first order.
    const everOrderedUserIds = await Order.distinct('user', {});
    const recentlyActiveUserIds = await Order.distinct('user', { createdAt: { $gte: inactiveCutoff } });
    const recentlyActiveSet = new Set(recentlyActiveUserIds.map((id) => id.toString()));
    const inactiveUserIds = everOrderedUserIds.filter((id) => !recentlyActiveSet.has(id.toString()));

    if (!inactiveUserIds.length) return;

    const users = await User.find({
        _id: { $in: inactiveUserIds },
        role: 'user',
        $or: [
            { lastWinbackSentAt: null },
            { lastWinbackSentAt: { $lte: cooldownCutoff } }
        ]
    }).select('name phone fcmToken');

    for (const user of users) {
        await sendWinback(user);
        user.lastWinbackSentAt = new Date();
        await user.save();
    }
};

let started = false;

const startWinbackScheduler = () => {
    if (started) return;
    started = true;
    // Exact time of day doesn't matter (the 14-day cooldown is what prevents
    // repeat sends), so run every 6 hours rather than depend on server timezone.
    cron.schedule('0 */6 * * *', () => {
        sweep().catch((error) => console.error('Win-back sweep failed:', error));
    });
    console.log('💛 Win-back scheduler started (checks every 6 hours)');
};

module.exports = { startWinbackScheduler, sweep };
