/**
 * Socket Manager
 * Tracks online driver socket connections and exposes emit helpers.
 *
 * driverSockets: Map<driverId (string) → socketId (string)>
 */

let io = null;
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
const driverSockets = new Map();        // driverId → socketId
const orderNotifiedDrivers = new Map(); // orderId  → Set<driverId>  (who was rung)
const orderDeclines = new Map();        // orderId  → Set<driverId>  (who declined)

/**
 * Log to terminal + stream to any test clients watching '_testers' room.
 * level: 'info' | 'success' | 'warn' | 'error' | 'event'
 */
const serverLog = (msg, level = 'info') => {
    const prefix = { info: 'ℹ', success: '✅', warn: '⚠️', error: '❌', event: '📡' };
    console.log(`${prefix[level] || 'ℹ'} [SOCKET] ${msg}`);
    if (io) {
        io.to('_testers').emit('server_log', {
            msg,
            level,
            time: new Date().toLocaleTimeString(),
        });
    }
};

exports.serverLog = serverLog;

exports.init = (httpServer) => {
    const { Server } = require('socket.io');
    io = new Server(httpServer, {
        cors: { origin: '*' },
        transports: ['websocket', 'polling'],
    });

    io.on('connection', (socket) => {
        serverLog(`New socket connected: ${socket.id}`, 'info');

        // Test client joins _testers room to receive server logs
        socket.on('join_testers', () => {
            socket.join('_testers');
            serverLog(`Test client joined logger room (socket: ${socket.id})`, 'success');
            socket.emit('server_log', {
                msg: `Connected to log stream. Socket-online drivers: ${driverSockets.size}`,
                level: 'success',
                time: new Date().toLocaleTimeString(),
            });
            const snapshot = [...driverSockets.entries()].map(([d, s]) => `${d} → ${s}`);
            socket.emit('server_log', {
                msg: `Socket map: [${snapshot.join(' | ') || 'none'}]`,
                level: 'info',
                time: new Date().toLocaleTimeString(),
            });
        });

        socket.on('get_online_drivers', async () => {
            try {
                const Driver = require('./models/driver');
                const drivers = await Driver.find({
                    'workInfo.status': 'approved',
                    'workInfo.availability': 'online',
                }).select('_id personalInfo.name auth.fcmToken').lean();

                const list = drivers.map(d => ({
                    id: String(d._id),
                    name: d.personalInfo?.name || 'Unknown',
                    socketConnected: driverSockets.has(String(d._id)),
                    hasFcmToken: !!d.auth?.fcmToken,
                }));

                socket.emit('online_drivers_list', list);
            } catch (err) {
                socket.emit('online_drivers_list', []);
            } 
        });

        socket.on('driver_online', async (data) => {
            const driverId = typeof data === 'string' ? data : data?.driverId;
            const pincode  = normalizePincode(typeof data === 'object' ? data?.pincode : null);
            if (!driverId) return;

            driverSockets.set(String(driverId), socket.id);
            serverLog(`Driver ${driverId} is now ONLINE (socket: ${socket.id}) | Total online: ${driverSockets.size}`, 'success');

            const Driver = require('./models/driver');

            let effectivePincode = pincode;
            if (pincode) {
                try {
                    await Driver.findByIdAndUpdate(driverId, { 'workInfo.currentPincode': pincode });
                    serverLog(`Driver ${driverId} pincode saved: ${pincode}`, 'info');
                } catch (err) {
                    serverLog(`Error saving pincode for driver ${driverId}: ${err.message}`, 'error');
                }
            }

            let driverLat = null, driverLng = null;
            try {
                const d = await Driver.findById(driverId)
                    .select('workInfo.currentLocation.coordinates workInfo.currentPincode')
                    .lean();
                if (!effectivePincode) effectivePincode = normalizePincode(d?.workInfo?.currentPincode);
                const coords = d?.workInfo?.currentLocation?.coordinates;
                const currentLat = toValidCoordinate(coords?.lat);
                const currentLng = toValidCoordinate(coords?.lng);
                if (currentLat != null && currentLng != null) {
                    driverLat = currentLat;
                    driverLng = currentLng;
                }
            } catch (_) {}

            // Send only recent unassigned pending orders (last 30 minutes) the driver may have missed
            try {
                const Order = require('./models/order');
                const since = new Date(Date.now() - 30 * 60 * 1000);

                const orderFilter = {
                    status: 'pending',
                    driver: null,
                    createdAt: { $gte: since },
                };

                const orderAreaQuery = [];

                if (effectivePincode) {
                    orderAreaQuery.push({ 'shippingAddress.pinCode': effectivePincode });
                }

                if (driverLat != null && driverLng != null) {
                    const deltaLat = DRIVER_RING_RADIUS_KM / 111;
                    const deltaLng = DRIVER_RING_RADIUS_KM / (111 * Math.cos(driverLat * Math.PI / 180));
                    orderAreaQuery.push({
                        'shippingAddress.lat': { $gte: driverLat - deltaLat, $lte: driverLat + deltaLat },
                        'shippingAddress.lng': { $gte: driverLng - deltaLng, $lte: driverLng + deltaLng },
                    });
                }

                if (orderAreaQuery.length) {
                    orderFilter.$or = orderAreaQuery;
                } else {
                    // No location and no pincode — skip to avoid ringing for all orders everywhere
                    serverLog(`Driver ${driverId} reconnected — no location/pincode, skipping missed orders`, 'warn');
                    return;
                }

                const pendingOrders = (await Order.find(orderFilter)
                    .select('_id orderId shippingAddress.lat shippingAddress.lng shippingAddress.pinCode')
                    .lean())
                    .filter(order => {
                        const orderPincode = normalizePincode(order.shippingAddress?.pinCode);
                        if (effectivePincode && orderPincode === effectivePincode) return true;

                        const orderLat = toValidCoordinate(order.shippingAddress?.lat);
                        const orderLng = toValidCoordinate(order.shippingAddress?.lng);
                        return orderLat != null
                            && orderLng != null
                            && driverLat != null
                            && driverLng != null
                            && getDistanceKm(driverLat, driverLng, orderLat, orderLng) <= DRIVER_RING_RADIUS_KM;
                    });

                if (pendingOrders.length) {
                    serverLog(`Driver ${driverId} reconnected — pushing ${pendingOrders.length} recent pending order(s)`, 'warn');
                    for (const order of pendingOrders) {
                        socket.emit('new_order', {
                            orderId: String(order._id),
                            orderCustomId: String(order.orderId),
                            pincode: normalizePincode(order.shippingAddress?.pinCode),
                        });
                        serverLog(`  ↳ Sent missed order ${order.orderId} to driver ${driverId}`, 'event');
                    }
                } else {
                    serverLog(`Driver ${driverId} reconnected — no recent pending orders`, 'info');
                }
            } catch (err) {
                serverLog(`Error fetching pending orders on reconnect: ${err.message}`, 'error');
            }
        });

        // Driver declines an order → stop ringing on their phone; track all-declined fallback
        socket.on('decline_order', ({ orderId, driverId }) => {
            socket.emit('stop_ringing', { orderId });
            serverLog(`Driver ${driverId} DECLINED order ${orderId}`, 'warn');
            exports.recordDecline(String(orderId), String(driverId));
        });

        // Driver sends real-time location update while on delivery
        socket.on('update_driver_location', async ({ driverId, orderId, lat, lng }) => {
            if (!driverId || !lat || !lng) return;

            try {
                const Driver = require('./models/driver');
                const mongoose = require('mongoose');

                // Persist location to DB
                await Driver.findByIdAndUpdate(driverId, {
                    'workInfo.currentLocation.coordinates.lat': lat,
                    'workInfo.currentLocation.coordinates.lng': lng,
                    'workInfo.currentLocation.lastUpdated': new Date(),
                });

                // Resolve orderId to the FST001 custom ID so the room key always matches
                let canonicalOrderId = null;
                if (orderId) {
                    const Order = require('./models/order');
                    const query = mongoose.Types.ObjectId.isValid(orderId)
                        ? { $or: [{ _id: orderId }, { orderId }] }
                        : { orderId };
                    const order = await Order.findOne(query).select('orderId').lean();
                    canonicalOrderId = order?.orderId || null;
                } else {
                    // Fall back to the driver's current order in DB
                    const driver = await Driver.findById(driverId).select('workInfo.currentOrder').lean();
                    if (driver?.workInfo?.currentOrder) {
                        const Order = require('./models/order');
                        const order = await Order.findById(driver.workInfo.currentOrder).select('orderId').lean();
                        canonicalOrderId = order?.orderId || null;
                    }
                }

                if (canonicalOrderId) {
                    const payload = { driverId: String(driverId), orderId: canonicalOrderId, lat, lng, timestamp: Date.now() };
                    io.to(`order_${canonicalOrderId}`).emit('driver_location', payload);
                    serverLog(`Location update for order ${canonicalOrderId}: lat=${lat} lng=${lng}`, 'event');
                }
            } catch (err) {
                serverLog(`update_driver_location error: ${err.message}`, 'error');
            }
        });

        // Customer joins an order-tracking room to receive driver location updates
        socket.on('track_order', async ({ orderId, userId }) => {
            if (!orderId) return;
            socket.join(`order_${orderId}`);
            serverLog(`Socket ${socket.id} (user ${userId || 'unknown'}) tracking order ${orderId}`, 'info');

            // Immediately send current driver location from DB if available
            try {
                const Order = require('./models/order');
                const Driver = require('./models/driver');
                const order = await Order.findOne({ orderId }).select('driver status user').lean();
                if (order && order.driver) {
                    const driver = await Driver.findById(order.driver)
                        .select('workInfo.currentLocation').lean();
                    const loc = driver?.workInfo?.currentLocation;
                    if (loc?.coordinates?.lat) {
                        socket.emit('driver_location', {
                            driverId: String(order.driver),
                            orderId: String(orderId),
                            lat: loc.coordinates.lat,
                            lng: loc.coordinates.lng,
                            timestamp: loc.lastUpdated ? new Date(loc.lastUpdated).getTime() : Date.now(),
                        });
                    }
                }
            } catch (err) {
                serverLog(`track_order DB lookup error: ${err.message}`, 'error');
            }
        });

        // Customer stops tracking
        socket.on('stop_tracking', ({ orderId }) => {
            if (!orderId) return;
            socket.leave(`order_${orderId}`);
            serverLog(`Socket ${socket.id} stopped tracking order ${orderId}`, 'info');
        });

        socket.on('disconnect', (reason) => {
            for (const [driverId, sid] of driverSockets.entries()) {
                if (sid === socket.id) {
                    driverSockets.delete(driverId);
                    serverLog(`Driver ${driverId} DISCONNECTED (${reason}) | Total online: ${driverSockets.size}`, 'warn');
                    break;
                }
            }
        });
    });

    return io;
};

exports.getIo = () => io;

/**
 * Emit a new order event to online drivers within 10 km of the delivery location.
 * Falls back to pincode match if lat/lng unavailable, or all online drivers if neither provided.
 */
exports.emitNewOrder = async (orderId, orderCustomId, lat = null, lng = null, deliveryPincode = null) => {
    if (!io) return;

    serverLog(`[DEBUG] emitNewOrder called — order=${orderCustomId} lat=${lat} lng=${lng} pincode=${deliveryPincode}`, 'info');

    const payload = {
        orderId: String(orderId),
        orderCustomId: String(orderCustomId),
        pincode: deliveryPincode ? String(deliveryPincode) : null,
    };

    try {
        const Driver = require('./models/driver');

        const driverFilter = {
            'workInfo.status': 'approved',
            'workInfo.availability': 'online',
        };

        const areaQuery = getOrderAreaQuery(lat, lng, deliveryPincode);
        if (!areaQuery.length) {
            serverLog(`New order ${orderCustomId} — no lat/lng or pincode, skipping driver ring`, 'warn');
            io.to('_testers').emit('tester_new_order', payload);
            return;
        }

        driverFilter.$or = areaQuery;
        const onlineDriverIds = (await Driver.find(driverFilter)
            .select('_id workInfo.currentLocation.coordinates workInfo.currentPincode')
            .lean())
            .filter(driver => driverMatchesOrderArea(driver, lat, lng, deliveryPincode));

        if (!onlineDriverIds.length) {
            serverLog(`New order ${orderCustomId} — no matching drivers (pincode or exact 10km radius)`, 'warn');
            io.to('_testers').emit('tester_new_order', payload);
            return;
        }

        serverLog(`New order ${orderCustomId} — ${onlineDriverIds.length} driver(s) matched (pincode or exact 10km radius)`, 'event');

        let socketSent = 0, noSocket = 0;
        for (const { _id } of onlineDriverIds) {
            const socketId = driverSockets.get(String(_id));
            if (socketId) {
                io.to(socketId).emit('new_order', payload);
                serverLog(`  ↳ socket → driver ${_id}`, 'success');
                socketSent++;
            } else {
                serverLog(`  ↳ no socket → driver ${_id} (FCM only)`, 'warn');
                noSocket++;
            }
        }

        // Track which drivers were notified so we can detect all-declined
        const notified = new Set(onlineDriverIds.map(d => String(d._id)));
        orderNotifiedDrivers.set(String(orderId), notified);
        orderDeclines.set(String(orderId), new Set());

        serverLog(`new_order done — socket: ${socketSent}, FCM-only: ${noSocket}`, 'info');
    } catch (err) {
        serverLog(`emitNewOrder error: ${err.message}`, 'error');
    }

    // Always push to test clients regardless of DB status
    io.to('_testers').emit('tester_new_order', payload);
};

/**
 * Record a driver's decline for an order.
 * If every notified driver has declined, fire the all_drivers_declined fallback.
 * Also exported so the HTTP decline endpoint can call it.
 */
exports.recordDecline = (orderId, driverId) => {
    const notified = orderNotifiedDrivers.get(orderId);
    const declines = orderDeclines.get(orderId);

    if (!notified || !declines) return;
    if (!notified.has(driverId)) return; // driver wasn't notified for this order, ignore

    declines.add(driverId);

    serverLog(`Order ${orderId}: ${declines.size}/${notified.size} driver(s) declined`, 'warn');

    if (declines.size >= notified.size) {
        serverLog(`Order ${orderId}: ALL drivers declined — triggering fallback`, 'error');

        if (io) {
            // Notify admin room and test clients
            io.to('_admin').emit('all_drivers_declined', { orderId });
            io.to('_testers').emit('all_drivers_declined', { orderId });
        }

        // Clean up tracking maps
        orderNotifiedDrivers.delete(orderId);
        orderDeclines.delete(orderId);

        // Optional: FCM to admin (wire up if you have an admin FCM token)
        // notifyAdmin('No drivers available', `Order ${orderId} was declined by all drivers.`);
    }
};

/**
 * Emit order_taken to all drivers EXCEPT the one who accepted.
 * Their phones should stop ringing.
 */
exports.emitOrderTaken = async (acceptedByDriverId, orderId, orderCustomId) => {
    if (!io) return;

    // Clear decline tracking — order is now assigned
    orderNotifiedDrivers.delete(String(orderId));
    orderDeclines.delete(String(orderId));

    const takenPayload = { orderId: String(orderId), orderCustomId: String(orderCustomId) };
    const stopPayload  = { orderId: String(orderId) };

    try {
        const Driver = require('./models/driver');

        // Notify all other approved+online drivers
        const onlineDriverIds = await Driver.find({
            'workInfo.status': 'approved',
            'workInfo.availability': 'online',
            _id: { $ne: acceptedByDriverId },
        }).select('_id').lean();

        serverLog(`Order ${orderCustomId} ACCEPTED by driver ${acceptedByDriverId} — notifying ${onlineDriverIds.length} other driver(s)`, 'event');

        let socketSent = 0, noSocket = 0;
        for (const { _id } of onlineDriverIds) {
            const socketId = driverSockets.get(String(_id));
            if (socketId) {
                io.to(socketId).emit('order_taken', takenPayload);
                serverLog(`  ↳ order_taken → driver ${_id}`, 'warn');
                socketSent++;
            } else {
                serverLog(`  ↳ no socket → driver ${_id} (FCM will handle)`, 'warn');
                noSocket++;
            }
        }

        serverLog(`order_taken done — socket: ${socketSent}, FCM-only: ${noSocket}`, 'success');
    } catch (err) {
        serverLog(`emitOrderTaken error: ${err.message}`, 'error');
    }

    // Stop ringing on the accepting driver's phone
    const acceptedSocketId = driverSockets.get(String(acceptedByDriverId));
    if (acceptedSocketId) {
        io.to(acceptedSocketId).emit('stop_ringing', stopPayload);
        serverLog(`  ↳ stop_ringing → accepting driver ${acceptedByDriverId}`, 'info');
    } else {
        serverLog(`  ↳ Accepting driver ${acceptedByDriverId} not on socket`, 'warn');
    }

    // Also push to test clients
    io.to('_testers').emit('order_taken', takenPayload);
};
