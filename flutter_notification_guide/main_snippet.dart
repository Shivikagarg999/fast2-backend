// Paste this into your main.dart (inside main() and in your root widget)
//
// pubspec.yaml additions needed:
//   firebase_core: ^3.x
//   firebase_messaging: ^15.x
//   http: ^1.x                  (if not already present)

import 'package:firebase_core/firebase_core.dart';
import 'notification_service.dart'; // adjust import path

// ─── main() ──────────────────────────────────────────────────────────────────
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();

  await NotificationService().init(
    backendBaseUrl: 'https://your-api-domain.com', // replace with real URL
    getDriverToken: () async {
      // Return the stored JWT, e.g. from SharedPreferences or your auth state
      return await AuthService.getToken(); // replace with your implementation
    },
    onNotificationTap: (orderId, screen) {
      // Navigate to order details when driver taps a notification
      if (screen == 'OrderDetails' && orderId != null) {
        navigatorKey.currentState?.pushNamed('/order-details', arguments: orderId);
      }
    },
  );

  runApp(const MyApp());
}

// ─── android/app/src/main/AndroidManifest.xml additions ──────────────────────
// Inside <application> tag, add these for the custom sound channel:
//
// <meta-data
//   android:name="com.google.firebase.messaging.default_notification_channel_id"
//   android:value="order_channel" />
//
// The universfield_ringtone_035_480585.mp3 file must be in:
//   android/app/src/main/res/raw/universfield_ringtone_035_480585.mp3
//
// ─── ios/Runner/Info.plist additions ─────────────────────────────────────────
// No extra plist changes needed — sound is sent in the FCM apns payload.
// The universfield-ringtone-035-480585.mp3 must be in:
//   ios/Runner/universfield-ringtone-035-480585.mp3 (bundle resource)
