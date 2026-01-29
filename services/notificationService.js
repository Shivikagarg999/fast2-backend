const admin = require('../config/firebase');
const Notification = require('../models/notification');
const User = require('../models/user');

/**
 * Send a notification (In-App + Push)
 * @param {string} userId - Target user ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} type - 'order' | 'payment' | 'delivery' | 'promo' | 'system'
 * @param {string} referenceId - Related ID (OrderId, etc.)
 * @param {object} data - Additional data payload for push
 */
exports.sendNotification = async (userId, title, body, type = 'system', referenceId = null, data = {}) => {
    try {
        // 1. Save In-App Notification
        const notification = await Notification.create({
            user: userId,
            title,
            body,
            type,
            referenceId,
            isRead: false
        });

        // 2. Send Push Notification (if token exists)
        const user = await User.findById(userId).select('fcmToken');

        if (user && user.fcmToken) {
            // Ensure data values are strings for FCM
            const strData = {};
            for (const key in data) {
                strData[key] = String(data[key]);
            }
            // Add standard fields to data
            strData.type = type;
            strData.click_action = 'FLUTTER_NOTIFICATION_CLICK'; // or logic for frontend routing
            if (referenceId) strData.referenceId = String(referenceId);

            const message = {
                token: user.fcmToken,
                notification: {
                    title,
                    body
                },
                data: strData
            };

            if (admin && admin.apps.length > 0) {
                await admin.messaging().send(message);
                // console.log(`Push sent to ${userId}`);
            }
        }

        return notification;
    } catch (error) {
        console.error(`Error sending notification to ${userId}:`, error.message);
        // Don't crash the main flow if notification fails
    }
};

/**
 * Helper: Notification for Order Status Change
 */
exports.notifyOrderStatus = async (userId, orderId, status) => {
    let title = 'Order Update';
    let body = `Your order #${orderId} is now ${status}`;

    switch (status) {
        case 'confirmed':
            title = 'Order Confirmed';
            body = `Your order #${orderId} has been confirmed and is being packed.`;
            break;
        case 'packed':
            title = 'Order Packed';
            body = `Good news! Your order #${orderId} is packed and ready.`;
            break;
        case 'out-of-delivery': // check exact enum in Order model
        case 'out_for_delivery':
            title = 'Out for Delivery';
            body = `Our partner is on their way with your order #${orderId}.`;
            break;
        case 'delivered':
            title = 'Order Delivered';
            body = `Your order #${orderId} has been delivered. Enjoy!`;
            break;
        case 'cancelled':
            title = 'Order Cancelled';
            body = `Your order #${orderId} has been cancelled.`;
            break;
    }

    await exports.sendNotification(userId, title, body, 'order', orderId, { orderId, status });
};
