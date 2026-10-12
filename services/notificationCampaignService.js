const admin = require('../config/firebase');
const User = require('../models/user');
const Notification = require('../models/notification');
const NotificationCampaign = require('../models/notificationCampaign');
const { sendNotification } = require('./notificationService');

const FCM_BATCH_SIZE = 500;
const INBOX_BATCH_SIZE = 1000;
const INVALID_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument'
]);

const chunk = (items, size) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};

const validateContent = ({ title, body }) => {
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanBody = typeof body === 'string' ? body.trim() : '';
    if (!cleanTitle || cleanTitle.length > 80) return { error: 'Title is required (max 80 characters)' };
    if (!cleanBody || cleanBody.length > 300) return { error: 'Message is required (max 300 characters)' };
    return { title: cleanTitle, body: cleanBody };
};

const sendBroadcast = async ({ title, body, adminId, scheduledNotification = null }) => {
    const customers = await User.find({ role: 'user' }).select('_id fcmToken').lean();

    for (const batch of chunk(customers, INBOX_BATCH_SIZE)) {
        await Notification.insertMany(
            batch.map((customer) => ({
                user: customer._id,
                title,
                body,
                type: 'system',
                isRead: false
            })),
            { ordered: false }
        );
    }

    const tokenUsers = customers.filter((customer) => customer.fcmToken);
    const invalidTokens = [];
    let pushSent = 0;
    let pushFailed = 0;

    if (admin.apps.length > 0) {
        for (const batch of chunk(tokenUsers, FCM_BATCH_SIZE)) {
            const tokens = batch.map((customer) => customer.fcmToken);
            const response = await admin.messaging().sendEachForMulticast({
                tokens,
                notification: { title, body },
                data: { type: 'system', click_action: 'FLUTTER_NOTIFICATION_CLICK' }
            });
            response.responses.forEach((result, index) => {
                if (result.success) {
                    pushSent += 1;
                } else {
                    pushFailed += 1;
                    if (INVALID_TOKEN_CODES.has(result.error?.code)) {
                        invalidTokens.push(tokens[index]);
                    }
                }
            });
        }
    }

    if (invalidTokens.length) {
        await User.updateMany({ fcmToken: { $in: invalidTokens } }, { $unset: { fcmToken: 1 } });
    }

    const campaign = await NotificationCampaign.create({
        title,
        body,
        audience: 'all',
        targetLabel: 'All customers',
        recipientCount: customers.length,
        pushSent,
        pushFailed,
        createdBy: adminId,
        scheduledNotification
    });

    return campaign;
};

const sendToUser = async ({ title, body, adminId, userQuery, scheduledNotification = null }) => {
    const user = await User.findOne(userQuery).select('_id name phone').lean();
    if (!user) return { error: 'No customer found with that phone number or ID' };

    await sendNotification(user._id, title, body, 'system', null, { type: 'system' });

    const campaign = await NotificationCampaign.create({
        title,
        body,
        audience: 'user',
        targetUser: user._id,
        targetLabel: user.name || user.phone || String(user._id),
        recipientCount: 1,
        pushSent: 0,
        pushFailed: 0,
        createdBy: adminId,
        scheduledNotification
    });

    return { campaign };
};

module.exports = { chunk, validateContent, sendBroadcast, sendToUser };
