const cron = require('node-cron');
const Cart = require('../models/cart');
const { sendNotification } = require('./notificationService');
const whatsappService = require('./whatsappService');

const ABANDON_AFTER_MS = 60 * 60 * 1000; // remind once a cart has sat untouched for 1 hour
const SWEEP_WINDOW_MS = 2 * 60 * 60 * 1000; // only look at carts that went stale in the last 2h
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // never remind the same cart more than once a day

// WhatsApp send is wrapped separately from push so a missing/unapproved
// template never blocks the (free, no-approval-needed) push reminder.
const sendReminder = async (user) => {
    if (user.fcmToken) {
        try {
            await sendNotification(
                user._id,
                'Your cart is waiting! 🛒',
                `Hi ${user.name || 'there'}, you left items in your cart. Complete your order before they run out!`,
                'promo'
            );
        } catch (error) {
            console.error(`Cart abandonment push failed for ${user._id}:`, error.message);
        }
    }

    if (user.phone) {
        try {
            await whatsappService.sendTemplate(user.phone, 'cart_abandonment_reminder', 'en', [user.name || 'there']);
        } catch (error) {
            console.error(`Cart abandonment WhatsApp failed for ${user._id}:`, error.message);
        }
    }
};

const sweep = async () => {
    const now = Date.now();
    const staleBefore = new Date(now - ABANDON_AFTER_MS);
    const windowStart = new Date(now - SWEEP_WINDOW_MS);
    const cooldownCutoff = new Date(now - REMINDER_COOLDOWN_MS);

    const carts = await Cart.find({
        'items.0': { $exists: true },
        updatedAt: { $gte: windowStart, $lte: staleBefore },
        $or: [
            { lastAbandonReminderAt: null },
            { lastAbandonReminderAt: { $lte: cooldownCutoff } }
        ]
    }).populate('user', 'name phone fcmToken role');

    for (const cart of carts) {
        const user = cart.user;
        if (!user || user.role !== 'user') continue;

        await sendReminder(user);

        cart.lastAbandonReminderAt = new Date();
        await cart.save();
    }
};

let started = false;

const startCartAbandonmentScheduler = () => {
    if (started) return;
    started = true;
    cron.schedule('*/15 * * * *', () => {
        sweep().catch((error) => console.error('Cart abandonment sweep failed:', error));
    });
    console.log('🛒 Cart abandonment scheduler started (checks every 15 minutes)');
};

module.exports = { startCartAbandonmentScheduler, sweep };
