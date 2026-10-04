const admin = require('../../../config/firebase');
const User = require('../../../models/user');
const Notification = require('../../../models/notification');
const NotificationCampaign = require('../../../models/notificationCampaign');
const { sendNotification } = require('../../../services/notificationService');

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

const sendBroadcast = async ({ title, body, adminId }) => {
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
        createdBy: adminId
    });

    return campaign;
};

const sendToUser = async ({ title, body, adminId, userQuery }) => {
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
        createdBy: adminId
    });

    return { campaign };
};

exports.sendNotificationCampaign = async (req, res) => {
    try {
        const validated = validateContent(req.body || {});
        if (validated.error) {
            return res.status(400).json({ success: false, message: validated.error });
        }

        const { audience, phone, userId } = req.body;
        const adminId = req.admin?._id;

        if (audience === 'all') {
            const campaign = await sendBroadcast({ ...validated, adminId });
            return res.status(201).json({ success: true, message: 'Notification sent to all customers', data: campaign });
        }

        if (audience === 'user') {
            let userQuery = null;
            if (userId) userQuery = { _id: userId };
            else if (phone) userQuery = { phone: String(phone).replace(/\D/g, '').slice(-10) };
            if (!userQuery) {
                return res.status(400).json({ success: false, message: 'Enter a customer phone number or user ID' });
            }
            const result = await sendToUser({ ...validated, adminId, userQuery });
            if (result.error) {
                return res.status(404).json({ success: false, message: result.error });
            }
            return res.status(201).json({ success: true, message: 'Notification sent to customer', data: result.campaign });
        }

        return res.status(400).json({ success: false, message: "audience must be 'all' or 'user'" });
    } catch (error) {
        console.error('Send notification campaign error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send notification', error: error.message });
    }
};

exports.getNotificationCampaigns = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

        const [campaigns, total] = await Promise.all([
            NotificationCampaign.find({})
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            NotificationCampaign.countDocuments({})
        ]);

        return res.status(200).json({
            success: true,
            data: campaigns,
            pagination: { currentPage: page, totalPages: Math.ceil(total / limit), total }
        });
    } catch (error) {
        console.error('Get notification campaigns error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load notification history' });
    }
};
