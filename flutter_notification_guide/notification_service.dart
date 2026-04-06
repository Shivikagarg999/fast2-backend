// lib/notification_service.dart
//
// Drop-in replacement for your existing NotificationService.
// Requires these pubspec.yaml additions:
//   firebase_core: ^3.x
//   firebase_messaging: ^15.x
//   flutter_local_notifications: ^17.2.4  (already present)

import 'dart:convert';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;

// ─── background handler (must be a top-level function) ──────────────────────
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Android OS handles the notification automatically via channel_id in the
  // FCM payload. Nothing to do here unless you need data-only messages.
  debugPrint('[BG FCM] ${message.messageId}');
}

// ─── channel definitions ─────────────────────────────────────────────────────
const _orderChannel = AndroidNotificationChannel(
  'order_channel',
  'Order Notifications',
  description: 'New delivery order alerts',
  importance: Importance.max,
  playSound: true,
  sound: RawResourceAndroidNotificationSound(
      'universfield_ringtone_035_480585'), // no extension
  enableVibration: true,
);

const _generalChannel = AndroidNotificationChannel(
  'general_channel',
  'General Notifications',
  description: 'General app notifications',
  importance: Importance.defaultImportance,
  playSound: true,
);

// ─── NotificationService ─────────────────────────────────────────────────────
class NotificationService {
  NotificationService._();
  static final NotificationService _instance = NotificationService._();
  factory NotificationService() => _instance;

  final _flutterLocalNotifications = FlutterLocalNotificationsPlugin();
  final _messaging = FirebaseMessaging.instance;

  /// Called once from main() — after Firebase.initializeApp()
  Future<void> init({
    required String backendBaseUrl, // e.g. "https://api.fast2.in"
    required Future<String?> Function() getDriverToken, // JWT getter
    void Function(String? orderId, String? screen)? onNotificationTap,
  }) async {
    // 1. Register background handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // 2. Create Android notification channels
    final androidPlugin = _flutterLocalNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(_orderChannel);
    await androidPlugin?.createNotificationChannel(_generalChannel);

    // 3. Initialise flutter_local_notifications
    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      ),
    );
    await _flutterLocalNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload != null
            ? jsonDecode(response.payload!) as Map<String, dynamic>
            : <String, dynamic>{};
        onNotificationTap?.call(
          payload['orderId'] as String?,
          payload['screen'] as String?,
        );
      },
    );

    // 4. Request permission
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // 5. Get & upload initial token
    final token = await _messaging.getToken();
    if (token != null) {
      await _uploadToken(token, backendBaseUrl, getDriverToken);
    }

    // 6. Handle token refresh
    _messaging.onTokenRefresh.listen((newToken) {
      _uploadToken(newToken, backendBaseUrl, getDriverToken);
    });

    // 7. FOREGROUND messages — show local notification manually
    FirebaseMessaging.onMessage.listen((message) {
      _showLocalNotification(message);
    });

    // 8. BACKGROUND tap (app was in background, user tapped notification)
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      final data = message.data;
      onNotificationTap?.call(
        data['orderId'] as String?,
        data['screen'] as String?,
      );
    });

    // 9. TERMINATED tap (app was killed, user tapped notification)
    final initial = await _messaging.getInitialMessage();
    if (initial != null) {
      // Delay so the widget tree is ready
      Future.delayed(const Duration(milliseconds: 500), () {
        final data = initial.data;
        onNotificationTap?.call(
          data['orderId'] as String?,
          data['screen'] as String?,
        );
      });
    }
  }

  // ── show foreground notification via flutter_local_notifications ────────────
  void _showLocalNotification(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    final channelType = message.data['channel_type'] ?? 'general';
    final isOrder = channelType == 'order';

    final androidDetails = AndroidNotificationDetails(
      isOrder ? 'order_channel' : 'general_channel',
      isOrder ? 'Order Notifications' : 'General Notifications',
      channelDescription:
          isOrder ? 'New delivery order alerts' : 'General app notifications',
      importance: isOrder ? Importance.max : Importance.defaultImportance,
      priority: isOrder ? Priority.max : Priority.defaultPriority,
      playSound: true,
      sound: isOrder
          ? const RawResourceAndroidNotificationSound(
              'universfield_ringtone_035_480585')
          : null,
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
      // iOS plays the sound declared in the FCM apns payload automatically;
      // local notification uses default — driver will hear it either way.
    );

    final details =
        NotificationDetails(android: androidDetails, iOS: iosDetails);

    _flutterLocalNotifications.show(
      message.hashCode,
      notification.title,
      notification.body,
      details,
      payload: jsonEncode(message.data),
    );
  }

  // ── upload FCM token to backend ─────────────────────────────────────────────
  Future<void> _uploadToken(
    String token,
    String backendBaseUrl,
    Future<String?> Function() getDriverToken,
  ) async {
    try {
      final jwtToken = await getDriverToken();
      if (jwtToken == null) return;

      await http.post(
        Uri.parse('$backendBaseUrl/api/driverOrder/fcm-token'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwtToken',
        },
        body: jsonEncode({'fcmToken': token}),
      );
      debugPrint('[FCM] Token uploaded');
    } catch (e) {
      debugPrint('[FCM] Token upload failed: $e');
    }
  }
}
