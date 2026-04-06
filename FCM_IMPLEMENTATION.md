# FCM Push Notifications — Implementation Guide for Frontend (Flutter)

## Overview

When a new order is placed, **all online drivers within 5 km of the warehouse** receive a push notification with the custom ringtone (`universfield_ringtone_035_480585`). When an admin manually assigns an order to a specific driver, that driver also gets the same ringtone notification.

---

## New Backend API Endpoint

### Save / Refresh FCM Token

```
POST /api/driverOrder/fcm-token
Authorization: Bearer <driver_jwt>
Content-Type: application/json

{ "fcmToken": "<device_fcm_token>" }
```

**Response**
```json
{ "success": true, "message": "FCM token updated" }
```

Call this:
- Once on app start (after `Firebase.initializeApp()`)
- Every time `FirebaseMessaging.instance.onTokenRefresh` fires

---

## Android Setup

### 1. pubspec.yaml

```yaml
dependencies:
  firebase_core: ^3.x
  firebase_messaging: ^15.x
  flutter_local_notifications: ^17.2.4
  http: ^1.x
```

### 2. Sound file location

```
android/app/src/main/res/raw/universfield_ringtone_035_480585.mp3
```
> File is already placed here — do not rename it.

### 3. AndroidManifest.xml

Inside the `<application>` tag add:

```xml
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="order_channel" />
```

### 4. Two notification channels to create at runtime

| Channel ID | Name | Sound | Importance |
|---|---|---|---|
| `order_channel` | Order Notifications | `universfield_ringtone_035_480585` | MAX |
| `general_channel` | General Notifications | Default system sound | DEFAULT |

Create both channels once during app init (before the first notification arrives):

```dart
const orderChannel = AndroidNotificationChannel(
  'order_channel',
  'Order Notifications',
  importance: Importance.max,
  playSound: true,
  sound: RawResourceAndroidNotificationSound('universfield_ringtone_035_480585'),
);

const generalChannel = AndroidNotificationChannel(
  'general_channel',
  'General Notifications',
  importance: Importance.defaultImportance,
);

final androidPlugin = FlutterLocalNotificationsPlugin()
    .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

await androidPlugin?.createNotificationChannel(orderChannel);
await androidPlugin?.createNotificationChannel(generalChannel);
```

---

## iOS Setup

### 1. Sound file location

```
ios/Runner/universfield-ringtone-035-480585.mp3
```
> File is already placed here. Make sure it is added as a bundle resource in Xcode.

### 2. No extra Info.plist changes needed

The sound is sent inside the FCM APNS payload from the backend. iOS plays it automatically.

---

## Notification Channels — When Each Is Used

| Scenario | Channel | Sound |
|---|---|---|
| New order placed (driver nearby) | `order_channel` | Custom ringtone |
| Admin manually assigns order to driver | `order_channel` | Custom ringtone |
| General alerts / status updates | `general_channel` | Default system sound |

The backend sends a `channel_type` field in the FCM `data` payload (`"order"` or `"general"`). Use this to decide which channel to use when showing a foreground notification manually.

---

## FCM Message States & How to Handle Them

### Foreground (app open)

Android does **not** auto-show notifications when the app is in the foreground. You must show it manually using `flutter_local_notifications`:

```dart
FirebaseMessaging.onMessage.listen((RemoteMessage message) {
  final channelType = message.data['channel_type'] ?? 'general';
  final isOrder = channelType == 'order';

  final androidDetails = AndroidNotificationDetails(
    isOrder ? 'order_channel' : 'general_channel',
    isOrder ? 'Order Notifications' : 'General Notifications',
    importance: isOrder ? Importance.max : Importance.defaultImportance,
    priority: isOrder ? Priority.max : Priority.defaultPriority,
    playSound: true,
    sound: isOrder
        ? const RawResourceAndroidNotificationSound('universfield_ringtone_035_480585')
        : null,
  );

  FlutterLocalNotificationsPlugin().show(
    message.hashCode,
    message.notification?.title,
    message.notification?.body,
    NotificationDetails(android: androidDetails),
    payload: jsonEncode(message.data),
  );
});
```

> This is what plays the ringtone even when the driver has the app open.

### Background (app minimised)

Android OS handles the notification automatically and routes it to the correct channel using the `channel_id` sent by the backend. **No extra code needed.**

### Terminated (app killed)

Same as background — Android OS shows the notification with the correct channel and sound. When the driver taps it and the app launches, retrieve the initial message:

```dart
final initial = await FirebaseMessaging.instance.getInitialMessage();
if (initial != null) {
  // navigate to order details
}
```

---

## Background Handler

Must be a **top-level function** (not inside a class):

```dart
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Android OS handles display automatically — nothing else needed here
}
```

Register it before `runApp`:

```dart
FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
```

---

## FCM Data Payload Fields

Every notification from the backend includes these fields in `message.data`:

| Field | Value | Description |
|---|---|---|
| `channel_type` | `"order"` or `"general"` | Which channel to use in foreground |
| `click_action` | `"FLUTTER_NOTIFICATION_CLICK"` | Standard Flutter FCM routing |
| `type` | `"new_order"` or `"order_assigned"` | Notification intent |
| `orderId` | MongoDB `_id` string | Use to fetch order from API |
| `orderCustomId` | e.g. `"FST042"` | Human-readable order ID |
| `screen` | `"OrderDetails"` | Screen to navigate to on tap |

---

## Notification Tap — Navigation

### Background tap (app was minimised)

```dart
FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
  final orderId = message.data['orderId'];
  final screen = message.data['screen'];
  if (screen == 'OrderDetails' && orderId != null) {
    Navigator.pushNamed(context, '/order-details', arguments: orderId);
  }
});
```

### Terminated tap (app was killed)

```dart
final initial = await FirebaseMessaging.instance.getInitialMessage();
if (initial != null) {
  final orderId = initial.data['orderId'];
  // navigate after widget tree is ready
  Future.delayed(Duration(milliseconds: 500), () {
    Navigator.pushNamed(context, '/order-details', arguments: orderId);
  });
}
```

### Foreground tap (local notification)

```dart
// In FlutterLocalNotificationsPlugin.initialize()
onDidReceiveNotificationResponse: (response) {
  final data = jsonDecode(response.payload ?? '{}');
  final orderId = data['orderId'];
  if (orderId != null) {
    Navigator.pushNamed(context, '/order-details', arguments: orderId);
  }
},
```

---

## main.dart — Initialisation Order

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Firebase first
  await Firebase.initializeApp();

  // 2. Register background handler
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  // 3. Create notification channels + init flutter_local_notifications
  await NotificationService().init(...);

  // 4. Request permission
  await FirebaseMessaging.instance.requestPermission();

  // 5. Get token and POST to /api/driverOrder/fcm-token
  final token = await FirebaseMessaging.instance.getToken();
  if (token != null) await uploadFcmToken(token);

  // 6. Listen for token refresh
  FirebaseMessaging.instance.onTokenRefresh.listen(uploadFcmToken);

  runApp(const MyApp());
}
```

---

## Complete FCM Payload Shape (sent by backend)

### Order notification (custom ringtone)

```json
{
  "token": "<driver_fcm_token>",
  "android": {
    "priority": "high",
    "notification": {
      "title": "New Order Available!",
      "body": "Order #FST042 is ready for pickup near you.",
      "channelId": "order_channel",
      "priority": "HIGH"
    }
  },
  "apns": {
    "headers": { "apns-priority": "10" },
    "payload": {
      "aps": {
        "alert": { "title": "New Order Available!", "body": "Order #FST042 is ready for pickup near you." },
        "sound": "universfield-ringtone-035-480585.mp3",
        "badge": 1
      }
    }
  },
  "data": {
    "channel_type": "order",
    "click_action": "FLUTTER_NOTIFICATION_CLICK",
    "type": "new_order",
    "orderId": "664abc123...",
    "orderCustomId": "FST042",
    "screen": "OrderDetails"
  }
}
```

### General notification (default sound)

```json
{
  "android": {
    "notification": { "channelId": "general_channel" }
  },
  "apns": {
    "payload": { "aps": { "sound": "default" } }
  },
  "data": {
    "channel_type": "general",
    ...
  }
}
```

---

## Files Changed on Backend (for reference)

| File | What changed |
|---|---|
| `services/driverNotificationService.js` | **New** — FCM helper with channel support + nearby driver broadcast |
| `controllers/driver/driverControllers.js` | Added `updateFcmToken` handler |
| `routes/driver/driverRoutes.js` | Added `POST /api/driverOrder/fcm-token` |
| `controllers/admin/driver/driver.js` | `assignOrderToDriver` now sends FCM to the assigned driver |
| `controllers/order/order.js` | `createOrder` now notifies all nearby drivers after order commit |

---

## Quick Checklist

- [ ] Add `firebase_core`, `firebase_messaging`, `http` to pubspec.yaml
- [ ] Place `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) in correct directories
- [ ] Sound file `universfield_ringtone_035_480585.mp3` is in `android/app/src/main/res/raw/`
- [ ] Sound file `universfield-ringtone-035-480585.mp3` is in `ios/Runner/` and added as a Xcode bundle resource
- [ ] Add `default_notification_channel_id` meta-data to `AndroidManifest.xml`
- [ ] Create both Android channels at app init before any notification arrives
- [ ] Register background handler as a top-level function
- [ ] POST FCM token to `POST /api/driverOrder/fcm-token` on init and on refresh
- [ ] Handle all 3 states: foreground (manual show), background tap, terminated tap
- [ ] Navigate to `OrderDetails` screen on notification tap using `orderId` from `message.data`
