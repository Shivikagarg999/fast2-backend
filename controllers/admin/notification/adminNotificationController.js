const NotificationCampaign = require('../../../models/notificationCampaign');
const { validateContent, sendBroadcast, sendToUser } = require('../../../services/notificationCampaignService');

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
