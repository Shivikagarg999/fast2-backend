const driverApp = require('../config/firebaseDriver');
const Driver = require('../models/driver');
const DRIVER_RING_RADIUS_KM = 10;

const normalizePincode = (pincode) => {
    if (pincode == null) return null;
    const normalized = String(pincode).trim();
    return normalized || null;
};

const toValidCoordinate = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number !== 0 ? number : null;
};

const getDistanceKm = (lat1, lng1, lat2, lng2) => {
    const earthRadiusKm = 6371;
    const toRadians = (degree) => degree * Math.PI / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
        * Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const driverMatchesOrderArea = (driver, orderLat, orderLng, deliveryPincode) => {
    const lat = toValidCoordinate(orderLat);
    const lng = toValidCoordinate(orderLng);

    if (lat != null && lng != null) {
        const driverLat = toValidCoordinate(driver?.workInfo?.currentLocation?.coordinates?.lat);
        const driverLng = toValidCoordinate(driver?.workInfo?.currentLocation?.coordinates?.lng);
        if (driverLat == null || driverLng == null) return false;
        return getDistanceKm(lat, lng, driverLat, driverLng) <= DRIVER_RING_RADIUS_KM;
    }

    const normalizedDeliveryPincode = normalizePincode(deliveryPincode);
    const driverPincode = normalizePincode(driver?.workInfo?.currentPincode);
    return !!normalizedDeliveryPincode && driverPincode === normalizedDeliveryPincode;
};

const getOrderAreaQuery = (lat, lng, pincode) => {
    const query = [];
    const validLat = toValidCoordinate(lat);
    const validLng = toValidCoordinate(lng);
    const normalizedPincode = normalizePincode(pincode);

    if (validLat != null && validLng != null) {
        const deltaLat = DRIVER_RING_RADIUS_KM / 111;
        const deltaLng = DRIVER_RING_RADIUS_KM / (111 * Math.cos(validLat * Math.PI / 180));
        query.push({
            'workInfo.currentLocation.coordinates.lat': { $gte: validLat - deltaLat, $lte: validLat + deltaLat },
            'workInfo.currentLocation.coordinates.lng': { $gte: validLng - deltaLng, $lte: validLng + deltaLng },
        });
    } else if (normalizedPincode) {
        query.push({ 'workInfo.currentPincode': normalizedPincode });
    }

    return query;
};

/**
 * Send FCM to a specific FCM token with channel-aware payload
 * @param {string} fcmToken
 * @param {string} title
 * @param {string} body
 * @param {'order'|'g  eneral'} channelType
 * @param {object} data  - extra key/value pairs (all values must be strings)
 */
exports.sendDriverFcm = async (fcmToken, title, body, channelType = 'general', data = {}) => {
    if (!driverApp) return;
    if (!fcmToken) return;

    const channelId = channelType === 'order' ? 'order_channel_v2' : 'general_channel';
    const iosSound = channelType === 'order'
        ? 'universfield-ringtone-035-480585.mp3'
        : 'default';

    const strData = {};
    for (const key in data) strData[key] = String(data[key]);
    strData.channel_type = channelType;
    strData.click_action = 'FLUTTER_NOTIFICATION_CLICK';

    const message = {
        token: fcmToken,
        // Top-level notification ensures RemoteMessage.notification is always
        // populated in Flutter (foreground + background + terminated states)
        notification: { title, body },
        android: {
            priority: 'high',
            notification: {
                channelId,          // routes to order_channel (custom ringtone) or general_channel
                sound: channelType === 'order'
                    ? 'universfield_ringtone_035_480585'
                    : 'default',
            },
        },
        apns: {
            headers: { 'apns-priority': '10' },
            payload: {
                aps: {
                    alert: { title, body },
                    sound: iosSound,
                    'content-available': 1,     // wake device for background processing
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
/**
 * FCM fallback: tell all other online drivers that the order was taken.
 * Called from acceptOrder alongside emitOrderTaken (socket).
 */
exports.notifyOrderTaken = async (acceptedByDriverId, orderId, orderCustomId) => {
    try {
        const drivers = await Driver.find({
            'workInfo.status': 'approved',
            'workInfo.availability': { $in: ['online', 'on-delivery'] },
            _id: { $ne: acceptedByDriverId },
            'auth.fcmToken': { $ne: null },
        }).select('auth.fcmToken');

        if (!drivers.length) return;

        const title = 'Order Taken';
        const body = `Order #${orderCustomId} has been accepted by another driver.`;
        const data = {
            orderId: String(orderId),
            orderCustomId: String(orderCustomId),
            type: 'order_taken',
        };

        await Promise.allSettled(
            drivers.map(d => exports.sendDriverFcm(d.auth.fcmToken, title, body, 'general', data))
        );

        console.log(`notifyOrderTaken: FCM sent to ${drivers.length} other driver(s) for order ${orderCustomId}`);
    } catch (error) {
        console.error('Error in notifyOrderTaken:', error.message);
    }
};

exports.notifyNearbyDrivers = async (lat, lng, orderId, orderCustomId, deliveryPincode = null) => {
    try {
        const driverFilter = {
            'workInfo.status': 'approved',
            'workInfo.availability': 'online',
            'auth.fcmToken': { $ne: null },
        };

        const areaQuery = getOrderAreaQuery(lat, lng, deliveryPincode);
        if (!areaQuery.length) {
            console.log(`notifyNearbyDrivers: no lat/lng or pincode for order ${orderCustomId}, skipping FCM`);
            return;
        }

        driverFilter.$or = areaQuery;
        const drivers = (await Driver.find(driverFilter)
            .select('auth.fcmToken workInfo.currentLocation.coordinates workInfo.currentPincode')
            .lean())
            .filter(driver => driverMatchesOrderArea(driver, lat, lng, deliveryPincode));

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
            pincode: deliveryPincode ? String(deliveryPincode) : '',
        };

        const results = await Promise.allSettled(
            drivers.map(d => exports.sendDriverFcm(d.auth.fcmToken, title, body, 'order', data))
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        const mode = 'pincode or exact 10km radius';
        console.log(`New order ${orderCustomId}: notified ${sent}/${drivers.length} drivers (${mode})`);
    } catch (error) {
        console.error('Error notifying nearby drivers:', error.message);
    }
};
