# Flutter Driver App — Real-Time Order Integration Guide

Complete guide for integrating the incoming order "call" screen in the Flutter driver app.

---

## Backend Status

| Feature | Status |
|---|---|
| Broadcast new order to all online drivers | ✅ Ready |
| Full-screen ring trigger via `new_order` socket | ✅ Ready |
| Accept order REST endpoint | ✅ Ready |
| Dismiss all other drivers via `order_taken` | ✅ Ready |
| FCM fallback (background / killed app) | ✅ Ready |
| Decline tracking + all-declined admin fallback | ✅ Ready |
| Missed orders replay on reconnect | ✅ Ready |

---

## Socket Events Reference

| Event | Direction | Payload | Action |
|---|---|---|---|
| `driver_online` | Flutter → Server | `driverId: string` | Register on app start / login |
| `new_order` | Server → Flutter | `{ orderId, orderCustomId }` | Show full-screen call UI |
| `decline_order` | Flutter → Server | `{ orderId, driverId }` | Driver taps Decline |
| `stop_ringing` | Server → Flutter | `{ orderId }` | Dismiss call (you declined) |
| `order_taken` | Server → Flutter | `{ orderId, orderCustomId }` | Dismiss call (another driver accepted) |
| `all_drivers_declined` | Server → Admin | `{ orderId }` | All drivers declined — admin alert |

---

## REST Endpoints

### Accept Order
```
PATCH /api/driver/orders/:orderId/accept
Authorization: Bearer <driver_jwt>
```
Response:
```json
{
  "success": true,
  "data": { "orderId": "...", "orderCustomId": "FST018", "driverId": "..." }
}
```

### Decline Order (REST fallback)
```
PATCH /api/driver/orders/:orderId/decline
Authorization: Bearer <driver_jwt>
```
Use when socket is unavailable (reconnection, background).

### Toggle Availability
```
PATCH /api/driver/availability
Authorization: Bearer <driver_jwt>
Body: { "availability": "online" | "offline" }
```

---

## Flutter Implementation

### 1. Dependencies (pubspec.yaml)
```yaml
dependencies:
  socket_io_client: ^2.0.3
  firebase_messaging: ^14.0.0
  flutter_local_notifications: ^16.0.0
```

### 2. Socket Service
```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class DriverSocketService {
  static final DriverSocketService _instance = DriverSocketService._internal();
  factory DriverSocketService() => _instance;
  DriverSocketService._internal();

  late IO.Socket socket;

  void connect(String driverId) {
    socket = IO.io('https://your-api.com', {
      'transports': ['websocket', 'polling'],
      'autoConnect': false,
    });

    socket.connect();

    socket.onConnect((_) {
      socket.emit('driver_online', driverId);
    });

    socket.on('new_order', (data) {
      IncomingOrderHandler.show(
        orderId: data['orderId'],
        orderCustomId: data['orderCustomId'],
      );
    });

    socket.on('order_taken', (data) {
      IncomingOrderHandler.dismiss(data['orderId']);
    });

    socket.on('stop_ringing', (data) {
      IncomingOrderHandler.dismiss(data['orderId']);
    });

    socket.onDisconnect((_) {
      // Socket auto-reconnects — driver_online re-emitted on reconnect
    });
  }

  void decline(String orderId, String driverId) {
    socket.emit('decline_order', { 'orderId': orderId, 'driverId': driverId });
  }

  void disconnect() => socket.disconnect();
}
```

### 3. Incoming Order Handler
```dart
class IncomingOrderHandler {
  static String? _currentOrderId;

  static void show({ required String orderId, required String orderCustomId }) {
    _currentOrderId = orderId;
    // Navigate to full-screen call UI
    navigatorKey.currentState?.push(
      MaterialPageRoute(
        builder: (_) => IncomingOrderScreen(
          orderId: orderId,
          orderCustomId: orderCustomId,
        ),
        fullscreenDialog: true,
      ),
    );
  }

  static void dismiss(String orderId) {
    if (_currentOrderId == orderId) {
      _currentOrderId = null;
      navigatorKey.currentState?.pop();
    }
  }
}
```

### 4. Incoming Order Screen (Full-Screen Call UI)
```dart
class IncomingOrderScreen extends StatefulWidget {
  final String orderId;
  final String orderCustomId;

  const IncomingOrderScreen({
    required this.orderId,
    required this.orderCustomId,
  });

  @override
  State<IncomingOrderScreen> createState() => _IncomingOrderScreenState();
}

class _IncomingOrderScreenState extends State<IncomingOrderScreen> {
  bool _loading = false;

  Future<void> _accept() async {
    setState(() => _loading = true);
    try {
      final res = await ApiService.patch(
        '/api/driver/orders/${widget.orderId}/accept',
      );
      if (res['success'] == true) {
        // Server will emit stop_ringing back — handler pops this screen
        // Navigate to order details
        Navigator.pushReplacement(context,
          MaterialPageRoute(builder: (_) => ActiveOrderScreen(orderId: widget.orderId))
        );
      } else {
        _showError(res['message']);
      }
    } catch (e) {
      _showError(e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  void _decline() {
    DriverSocketService().decline(widget.orderId, DriverSession.driverId);
    // Server sends stop_ringing back → IncomingOrderHandler.dismiss() pops screen
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🛵', style: TextStyle(fontSize: 80)),
            const SizedBox(height: 24),
            const Text('Incoming Order',
              style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('#${widget.orderCustomId}',
              style: const TextStyle(color: Colors.blue, fontSize: 18)),
            const SizedBox(height: 48),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Decline
                GestureDetector(
                  onTap: _loading ? null : _decline,
                  child: Container(
                    width: 80, height: 80,
                    decoration: const BoxDecoration(
                      color: Colors.red, shape: BoxShape.circle),
                    child: const Icon(Icons.call_end, color: Colors.white, size: 36),
                  ),
                ),
                // Accept
                GestureDetector(
                  onTap: _loading ? null : _accept,
                  child: Container(
                    width: 80, height: 80,
                    decoration: const BoxDecoration(
                      color: Colors.green, shape: BoxShape.circle),
                    child: _loading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Icon(Icons.check, color: Colors.white, size: 36),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
```

### 5. FCM Setup (Background / Killed App)

**Android — create notification channel with ringtone**

In `android/app/src/main/AndroidManifest.xml`:
```xml
<meta-data
  android:name="com.google.firebase.messaging.default_notification_channel_id"
  android:value="order_channel_v2" />
```

In your `Application.kt` or `MainActivity.kt`:
```kotlin
val channel = NotificationChannel(
  "order_channel_v2",
  "Incoming Orders",
  NotificationManager.IMPORTANCE_HIGH
).apply {
  setSound(
    Uri.parse("android.resource://${packageName}/raw/universfield_ringtone_035_480585"),
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .build()
  )
  enableVibration(true)
}
(getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
  .createNotificationChannel(channel)
```

Place ringtone file at:
```
android/app/src/main/res/raw/universfield_ringtone_035_480585.mp3
```

**Flutter FCM handler:**
```dart
FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (message.data['type'] == 'new_order') {
    // Show full-screen notification / launch app to IncomingOrderScreen
    await showIncomingOrderNotification(
      orderId: message.data['orderId'],
      orderCustomId: message.data['orderCustomId'],
    );
  } else if (message.data['type'] == 'order_taken') {
    await cancelIncomingOrderNotification();
  }
}
```

---

## App Startup Flow

```
Driver opens app
      │
      ▼
Login → get JWT token
      │
      ▼
PATCH /api/driver/availability { "availability": "online" }
      │
      ▼
DriverSocketService().connect(driverId)
      │
      ▼  (socket connects)
emit driver_online → server replays any missed pending orders
      │
      ▼
listen: new_order → show IncomingOrderScreen
listen: order_taken / stop_ringing → dismiss IncomingOrderScreen
```

---

## Files Changed on Backend

| File | What was added |
|---|---|
| `socketManager.js` | Decline tracking, `recordDecline()`, all-declined fallback, cleanup on accept |
| `services/driverNotificationService.js` | `notifyOrderTaken()` — FCM to other drivers on accept |
| `controllers/driver/driverControllers.js` | `declineOrder` HTTP endpoint |
| `routes/driver/driverRoutes.js` | `PATCH /orders/:orderId/decline` |
| `server.js` | `/test` route, `localhost:5000` added to CORS origins |
| `test-socket.html` | Full browser test UI |
