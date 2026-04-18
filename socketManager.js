/**
 * Socket Manager
 * Tracks online driver socket connections and exposes emit helpers.
 *
 * driverSockets: Map<driverId (string) → socketId (string)>
 */

let io = null;
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

        // Return list of DB approved+online drivers with socket status
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

        // Driver registers itself after connecting (or reconnecting after phone was off)
        socket.on('driver_online', async (driverId) => {
            if (!driverId) return;
            driverSockets.set(String(driverId), socket.id);
            serverLog(`Driver ${driverId} is now ONLINE (socket: ${socket.id}) | Total online: ${driverSockets.size}`, 'success');

            // Send only recent unassigned pending orders (last 30 minutes) the driver may have missed
            try {
                const Order = require('./models/order');
                const since = new Date(Date.now() - 30 * 60 * 1000); // last 30 minutes only

                const pendingOrders = await Order.find({
                    status: 'pending',
                    driver: null,
                    createdAt: { $gte: since },
                }).select('_id orderId').lean();

                if (pendingOrders.length) {
                    serverLog(`Driver ${driverId} reconnected — pushing ${pendingOrders.length} recent pending order(s)`, 'warn');
                    for (const order of pendingOrders) {
                        socket.emit('new_order', {
                            orderId: String(order._id),
                            orderCustomId: String(order.orderId),
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
 * Emit a new order event to ALL connected online drivers.
 */
exports.emitNewOrder = async (orderId, orderCustomId) => {
    if (!io) return;

    const payload = {
        orderId: String(orderId),
        orderCustomId: String(orderCustomId),
    };

    try {
        const Driver = require('./models/driver');

        // Only drivers who are approved + online in DB
        const onlineDriverIds = await Driver.find({
            'workInfo.status': 'approved',
            'workInfo.availability': 'online',
        }).select('_id').lean();

        if (!onlineDriverIds.length) {
            serverLog(`New order ${orderCustomId} — no approved+online drivers in DB`, 'warn');
            io.to('_testers').emit('new_order', payload);
            return;
        }

        serverLog(`New order ${orderCustomId} — ${onlineDriverIds.length} approved+online driver(s) in DB`, 'event');

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
    io.to('_testers').emit('new_order', payload);
};

/**
 * Record a driver's decline for an order.
 * If every notified driver has declined, fire the all_drivers_declined fallback.
 * Also exported so the HTTP decline endpoint can call it.
 */
exports.recordDecline = (orderId, driverId) => {
    const notified = orderNotifiedDrivers.get(orderId);
    const declines = orderDeclines.get(orderId);

    if (!notified || !declines) return; // order already assigned or unknown

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
