const driverApp = require('../config/firebaseDriver');
const Driver = require('../models/driver');

/**
 * Send FCM to a specific FCM token with channel-aware payload
 * @param {string} fcmToken
 * @param {string} title
 * @param {string} body
 * @param {'order'|'general'} channelType
 * @param {object} data  - extra key/value pairs (all values must be strings)
 */
exports.sendDriverFcm = async (fcmToken, title, body, channelType = 'general', data = {}) => {
    if (!driverApp) return;
    if (!fcmToken) return;

    const channelId = channelType === 'order' ? 'order_channel' : 'general_channel';
    const iosSound = channelType === 'order'
        ? 'universfield-ringtone-035-480585.mp3'
        : 'default';

    // All FCM data values must be strings
    const strData = {};
    for (const key in data) strData[key] = String(data[key]);
    strData.channel_type = channelType;
    strData.click_action = 'FLUTTER_NOTIFICATION_CLICK';

    const message = {
        token: fcmToken,
        android: {
            priority: 'high',
            notification: {
                title,
                body,
                channelId,
                priority: 'HIGH',
                defaultSound: channelType !== 'order',
                sound: channelType === 'order' ? 'universfield_ringtone_035_480585' : null,
            },
        },
        apns: {
            headers: {
                'apns-priority': '10',
            },
            payload: {
                aps: {
                    alert: { title, body },
                    sound: iosSound,
                    badge: 1,
                    contentAvailable: true,
                },
            },
        },
        data: strData,
    };

    try {
        await driverApp.messaging().send(message);
    } catch (error) {
        console.error(`FCM send error (token: ...${fcmToken.slice(-6)}):`, error.message);
    }
};

/**
 * Send notification to a driver by their DB _id
 */
exports.sendDriverNotification = async (driverId, title, body, channelType = 'general', data = {}) => {
    try {
        const driver = await Driver.findById(driverId).select('auth.fcmToken');
        if (!driver || !driver.auth?.fcmToken) return;
        await exports.sendDriverFcm(driver.auth.fcmToken, title, body, channelType, data);
    } catch (error) {
        console.error(`Error sending driver notification to ${driverId}:`, error.message);
    }
};

/**
 * Notify all online+approved drivers within maxDistance metres of a warehouse.
 * Uses the 2dsphere index on workInfo.currentLocation.coordinates.
 *
 * @param {number} warehouseLat
 * @param {number} warehouseLng
 * @param {string} orderId        - MongoDB _id of the order
 * @param {string} orderCustomId  - Human-readable order ID (e.g. FST042)
 * @param {number} maxDistance    - metres, default 5 km
 */
exports.notifyNearbyDrivers = async (warehouseLat, warehouseLng, orderId, orderCustomId) => {
    try {
        const drivers = await Driver.find({
            'workInfo.status': 'approved',
            'workInfo.availability': 'online',
            'auth.fcmToken': { $ne: null },
        }).select('auth.fcmToken');

        if (!drivers.length) {
            console.log(`No online drivers found for order ${orderCustomId}`);
            return;
        }

        const title = 'New Order Available!';
        const body = `Order #${orderCustomId} is ready for pickup near you.`;
        const data = {
            orderId: String(orderId),
            orderCustomId: String(orderCustomId),
            type: 'new_order',
            screen: 'OrderDetails',
        };

        const results = await Promise.allSettled(
            drivers.map(d => exports.sendDriverFcm(d.auth.fcmToken, title, body, 'order', data))
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        console.log(`New order ${orderCustomId}: notified ${sent}/${drivers.length} nearby drivers`);
    } catch (error) {
        console.error('Error notifying nearby drivers:', error.message);
    }
};
