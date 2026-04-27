# Live Order Tracking — Flutter Integration Guide

Real-time delivery tracking using Socket.io. The driver app streams GPS coordinates; the customer app receives them and updates the map live.
  
---

## How It Works

```
Driver App  ──emit──►  Socket Server  ──broadcast──►  Customer App
            update_driver_location       driver_location
                     │
                     ▼
                  MongoDB (persisted)
                     │
                     ▼
              REST GET /tracking  (fallback / initial load)
```

---

## Dependencies (pubspec.yaml)

```yaml
dependencies:
  socket_io_client: ^2.0.3+1
  google_maps_flutter: ^2.5.0
  geolocator: ^11.0.0        # driver app only
  http: ^1.2.0
```

---

## Base URL

```dart
const String baseUrl = 'https://api.fast2.in';        // production
// const String baseUrl = 'http://localhost:5000';     // local dev
```

---

## Customer App Integration

### 1. TrackingService

Create `lib/services/tracking_service.dart`:

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class TrackingService {
  static final TrackingService _instance = TrackingService._internal();
  factory TrackingService() => _instance;
  TrackingService._internal();

  IO.Socket? _socket;

  /// Called once at app start (or after login)
  void connect() {
    _socket = IO.io(
      'https://api.fast2.in',
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .build(),
    );
    _socket!.connect();
  }

  void disconnect() {
    _socket?.disconnect();
    _socket = null;
  }

  /// Subscribe to location updates for [orderId].
  /// [onLocation] fires every time the driver moves.
  void trackOrder({
    required String orderId,
    required String userId,
    required void Function(double lat, double lng, DateTime timestamp) onLocation,
  }) {
    if (_socket == null) connect();

    _socket!.emit('track_order', {'orderId': orderId, 'userId': userId});

    _socket!.on('driver_location', (data) {
      if (data['orderId'] != orderId) return;
      final lat = (data['lat'] as num).toDouble();
      final lng = (data['lng'] as num).toDouble();
      final ts  = DateTime.fromMillisecondsSinceEpoch(data['timestamp'] as int);
      onLocation(lat, lng, ts);
    });
  }

  void stopTracking(String orderId) {
    _socket?.emit('stop_tracking', {'orderId': orderId});
    _socket?.off('driver_location');
  }
}
```

---

### 2. Tracking Screen

Create `lib/screens/order_tracking_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import '../services/tracking_service.dart';

class OrderTrackingScreen extends StatefulWidget {
  final String orderId;
  final String userId;
  final String authToken;

  const OrderTrackingScreen({
    super.key,
    required this.orderId,
    required this.userId,
    required this.authToken,
  });

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  final TrackingService _tracking = TrackingService();
  GoogleMapController? _mapController;

  LatLng? _driverLocation;
  DateTime? _lastUpdated;
  bool _loading = true;
  String? _driverName;
  String _orderStatus = '';

  @override
  void initState() {
    super.initState();
    _fetchInitialLocation();
    _subscribeToLiveUpdates();
  }

  /// One-time REST fetch to get the current location before socket updates arrive
  Future<void> _fetchInitialLocation() async {
    try {
      final res = await http.get(
        // orderId = human-readable ID e.g. "FST001", not the MongoDB _id
        Uri.parse('https://api.fast2.in/api/orders/${widget.orderId}/tracking'),
        headers: {'Authorization': 'Bearer ${widget.authToken}'},
      );
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body)['data'];
        final loc  = body['location'];
        setState(() {
          _orderStatus = body['orderStatus'] ?? '';
          _driverName  = body['driver']?['name'];
          if (loc != null) {
            _driverLocation = LatLng(loc['lat'], loc['lng']);
            _lastUpdated    = loc['lastUpdated'] != null
                ? DateTime.tryParse(loc['lastUpdated'])
                : null;
          }
          _loading = false;
        });
        if (_driverLocation != null) {
          _mapController?.animateCamera(
            CameraUpdate.newLatLng(_driverLocation!),
          );
        }
      } else {
        setState(() => _loading = false);
      }
    } catch (e) {
      setState(() => _loading = false);
    }
  }

  void _subscribeToLiveUpdates() {
    _tracking.trackOrder(
      orderId: widget.orderId,
      userId: widget.userId,
      onLocation: (lat, lng, timestamp) {
        final newPos = LatLng(lat, lng);
        setState(() {
          _driverLocation = newPos;
          _lastUpdated    = timestamp;
          _loading        = false;
        });
        _mapController?.animateCamera(CameraUpdate.newLatLng(newPos));
      },
    );
  }

  @override
  void dispose() {
    _tracking.stopTracking(widget.orderId);
    super.dispose();
  }

  // True once the order has a driver assigned (accepted or picked-up)
  bool get _driverAssigned =>
      _orderStatus == 'accepted' || _orderStatus == 'picked-up';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Track Order'),
        backgroundColor: Colors.orange,
      ),
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(
              target: _driverLocation ?? const LatLng(20.5937, 78.9629),
              zoom: _driverLocation != null ? 15 : 5,
            ),
            onMapCreated: (c) => _mapController = c,
            markers: _driverLocation != null
                ? {
                    Marker(
                      markerId: const MarkerId('driver'),
                      position: _driverLocation!,
                      icon: BitmapDescriptor.defaultMarkerWithHue(
                          BitmapDescriptor.hueOrange),
                      infoWindow: InfoWindow(
                        title: _driverName ?? 'Driver',
                        snippet: _orderStatus,
                      ),
                    ),
                  }
                : {},
          ),

          // Overlay shown when driver accepted but hasn't shared GPS yet
          if (!_loading && _driverAssigned && _driverLocation == null)
            Positioned.fill(
              child: IgnorePointer(
                child: Center(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 32),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 16),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.93),
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(color: Colors.black12, blurRadius: 8)
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.orange,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Flexible(
                          child: Text(
                            _driverName != null
                                ? '$_driverName is on the way.\nLive location will appear shortly…'
                                : 'Driver is on the way.\nLive location will appear shortly…',
                            style: const TextStyle(fontSize: 14),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

          // Status card at the bottom
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _StatusCard(
              driverName: _driverName,
              orderStatus: _orderStatus,
              hasLocation: _driverLocation != null,
              lastUpdated: _lastUpdated,
              loading: _loading,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  final String? driverName;
  final String orderStatus;
  final bool hasLocation;
  final DateTime? lastUpdated;
  final bool loading;

  const _StatusCard({
    this.driverName,
    required this.orderStatus,
    required this.hasLocation,
    this.lastUpdated,
    required this.loading,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 8)],
      ),
      child: loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.delivery_dining, color: Colors.orange),
                    const SizedBox(width: 8),
                    Text(
                      driverName ?? 'Your driver',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  _statusLabel(orderStatus, hasLocation),
                  style: const TextStyle(color: Colors.grey),
                ),
                if (hasLocation && lastUpdated != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Updated ${_ago(lastUpdated!)}',
                    style: const TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ],
            ),
    );
  }

  String _statusLabel(String status, bool hasLocation) {
    switch (status) {
      case 'accepted':
        return hasLocation
            ? 'Driver is heading to pick up your order'
            : 'Driver accepted your order — getting live location…';
      case 'picked-up':
        return hasLocation
            ? 'Driver is on the way to deliver'
            : 'Order picked up — getting live location…';
      default:
        return 'Waiting for a driver to accept your order';
    }
  }

  String _ago(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    return '${diff.inHours}h ago';
  }
}
```

---

### 3. Navigate to the Tracking Screen

```dart
// From order detail page — after order is accepted or picked-up
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => OrderTrackingScreen(
      orderId: order.id,           // MongoDB _id
      userId: currentUser.id,
      authToken: authService.token,
    ),
  ),
);
```

---

## Driver App Integration

### 1. LocationService

Create `lib/services/location_service.dart`:

```dart
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'dart:async';

class LocationService {
  static final LocationService _instance = LocationService._internal();
  factory LocationService() => _instance;
  LocationService._internal();

  IO.Socket? _socket;
  StreamSubscription<Position>? _positionStream;

  /// Call after driver accepts an order and goes on-delivery
  Future<void> startSharingLocation({
    required String driverId,
    required String orderId,
  }) async {
    // Ensure permissions
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied) return;
    }

    // Connect socket if not already connected
    _socket ??= IO.io(
      'https://api.fast2.in',
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .build(),
    );
    if (!(_socket!.connected)) _socket!.connect();

    // Stream GPS updates every 5 seconds
    _positionStream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,         // emit only if moved 10m
        timeLimit: Duration(seconds: 5),
      ),
    ).listen((Position pos) {
      _socket!.emit('update_driver_location', {
        'driverId': driverId,
        'orderId': orderId,
        'lat': pos.latitude,
        'lng': pos.longitude,
      });
    });
  }

  /// Call when order is delivered or driver goes offline
  void stopSharingLocation() {
    _positionStream?.cancel();
    _positionStream = null;
    _socket?.disconnect();
    _socket = null;
  }
}
```

---

### 2. Start/Stop from Order Flow

```dart
final _locationService = LocationService();

// When driver accepts order
await driverApi.acceptOrder(orderId);
await _locationService.startSharingLocation(
  driverId: driver.id,
  orderId: orderId,
);

// When driver marks order delivered
await driverApi.deliverOrder(orderId);
_locationService.stopSharingLocation();
```

---

### 3. REST Fallback (optional)

If the driver app cannot maintain a socket connection, call the REST endpoint instead:

```dart
Future<void> updateLocationRest(double lat, double lng, String token) async {
  await http.patch(
    Uri.parse('https://api.fast2.in/api/driver/location'),
    headers: {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({'lat': lat, 'lng': lng}),
  );
}
```

Call this on a `Timer.periodic(Duration(seconds: 10), ...)` when socket is unavailable.

---

## API Reference

### REST Endpoints

#### Get current driver location (Customer)
```
GET /api/orders/:orderId/tracking
Authorization: Bearer <user_token>
```
`:orderId` is the **human-readable order ID** (e.g. `FST001`), same as used everywhere else in the order API.

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "68...",
    "orderStatus": "picked-up",
    "driver": { "id": "68...", "name": "Raju Kumar" },
    "location": {
      "lat": 28.6139,
      "lng": 77.2090,
      "lastUpdated": "2026-04-26T10:30:00.000Z"
    }
  }
}
```
Returns `400` when order status is not `accepted` or `picked-up`.  
Returns `null` for `location` if the driver hasn't shared a location yet.

#### Update driver location (Driver)
```
PATCH /api/driver/location
Authorization: Bearer <driver_token>
Content-Type: application/json

{ "lat": 28.6139, "lng": 77.2090 }
```
**Response:**
```json
{
  "success": true,
  "message": "Location updated",
  "data": { "lat": 28.6139, "lng": 77.2090, "orderId": "68..." }
}
```

---

### Socket Events

#### Customer emits
| Event | Payload | Effect |
|---|---|---|
| `track_order` | `{ orderId, userId }` | Joins order room; receives current location immediately |
| `stop_tracking` | `{ orderId }` | Leaves the room |

#### Customer receives
| Event | Payload |
|---|---|
| `driver_location` | `{ driverId, orderId, lat, lng, timestamp }` |

#### Driver emits
| Event | Payload | Effect |
|---|---|---|
| `update_driver_location` | `{ driverId, orderId, lat, lng }` | Saves to DB; broadcasts to all customers tracking that order |
| `driver_online` | `driverId` | Registers driver on the socket server |

---

## Order Statuses When Tracking Is Active

```
pending       →  No driver yet
confirmed     →  No driver yet
accepted      →  ✅ Driver heading to warehouse/shop
picked-up     →  ✅ Driver heading to customer
delivered     →  Tracking ends
cancelled     →  Tracking ends
```

Only `accepted` and `picked-up` return a valid tracking response from the REST endpoint.

---

## Support / Contact API

Users can raise a support request from anywhere in the app — order issues, delivery problems, refund requests, etc.

### Endpoint

```
POST /api/contact/submit
Content-Type: application/json
```
No auth token required.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | 2–100 chars |
| `email` | string | yes | valid email format |
| `phone` | string | yes | exactly 10 digits |
| `subject` | string | yes | must be one of the enum values below |
| `message` | string | yes | 10–5000 chars |
| `source` | string | no | send `"mobile-app"` from Flutter |

**Subject enum values:**
```
General Inquiry
Product Support
Order Issue
Delivery Problem
Return/Refund
Partnership Inquiry
Feedback
Other
```

> `Order Issue`, `Delivery Problem`, and `Return/Refund` are automatically marked **high priority** by the server.

### Success response `201`
```json
{
  "success": true,
  "message": "Your message has been received! We will get back to you soon.",
  "data": {
    "id": "68...",
    "referenceNumber": "CONTACT-A3F9C1",
    "submittedAt": "2026-04-27T10:30:00.000Z"
  }
}
```
Save `referenceNumber` and show it to the user so they can quote it when following up.

### Error responses
| Status | Reason |
|---|---|
| `400` | Missing/invalid field, or duplicate submission within 1 hour |
| `500` | Server error |

**Duplicate guard:** the same email + a similar message submitted within **1 hour** is rejected. Show the user a message like *"You already submitted a request recently. Please wait before sending again."*

---

### Flutter Integration

#### 1. SupportService

Create `lib/services/support_service.dart`:

```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class SupportService {
  static const _baseUrl = 'https://api.fast2.in';

  static Future<SupportResult> submitRequest({
    required String name,
    required String email,
    required String phone,
    required String subject,
    required String message,
  }) async {
    try {
      final res = await http.post(
        Uri.parse('$_baseUrl/api/contact/submit'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'name': name,
          'email': email,
          'phone': phone,
          'subject': subject,
          'message': message,
          'source': 'mobile-app',
        }),
      );

      final body = jsonDecode(res.body);

      if (res.statusCode == 201) {
        return SupportResult.success(
          referenceNumber: body['data']['referenceNumber'],
        );
      }

      // 400 duplicate guard
      if (res.statusCode == 400) {
        return SupportResult.failure(body['message'] ?? 'Invalid request');
      }

      return SupportResult.failure('Something went wrong. Please try again.');
    } catch (_) {
      return SupportResult.failure('No internet connection. Please try again.');
    }
  }
}

class SupportResult {
  final bool success;
  final String? referenceNumber;
  final String? error;

  SupportResult._({required this.success, this.referenceNumber, this.error});

  factory SupportResult.success({required String referenceNumber}) =>
      SupportResult._(success: true, referenceNumber: referenceNumber);

  factory SupportResult.failure(String error) =>
      SupportResult._(success: false, error: error);
}
```

---

#### 2. Support Screen

Create `lib/screens/support_screen.dart`:

```dart
import 'package:flutter/material.dart';
import '../services/support_service.dart';

// Subject options exactly matching the backend enum
const List<String> kSupportSubjects = [
  'General Inquiry',
  'Product Support',
  'Order Issue',
  'Delivery Problem',
  'Return/Refund',
  'Partnership Inquiry',
  'Feedback',
  'Other',
];

class SupportScreen extends StatefulWidget {
  // Pre-fill subject when navigating from an order (e.g. 'Order Issue')
  final String? initialSubject;

  const SupportScreen({super.key, this.initialSubject});

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  final _formKey  = GlobalKey<FormState>();
  final _nameCtr  = TextEditingController();
  final _emailCtr = TextEditingController();
  final _phoneCtr = TextEditingController();
  final _msgCtr   = TextEditingController();

  String? _subject;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _subject = widget.initialSubject ?? kSupportSubjects.first;
  }

  @override
  void dispose() {
    _nameCtr.dispose();
    _emailCtr.dispose();
    _phoneCtr.dispose();
    _msgCtr.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);

    final result = await SupportService.submitRequest(
      name:    _nameCtr.text.trim(),
      email:   _emailCtr.text.trim(),
      phone:   _phoneCtr.text.trim(),
      subject: _subject!,
      message: _msgCtr.text.trim(),
    );

    setState(() => _submitting = false);

    if (!mounted) return;

    if (result.success) {
      _showSuccess(result.referenceNumber!);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(result.error!), backgroundColor: Colors.red),
      );
    }
  }

  void _showSuccess(String refNumber) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        title: const Text('Request Submitted'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('We\'ve received your message and will get back to you soon.'),
            const SizedBox(height: 12),
            Text(
              'Reference: $refNumber',
              style: const TextStyle(
                  fontWeight: FontWeight.bold, fontFamily: 'monospace'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context); // close dialog
              Navigator.pop(context); // go back
            },
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Contact Support'),
        backgroundColor: Colors.orange,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              _Field(
                controller: _nameCtr,
                label: 'Full Name',
                validator: (v) =>
                    (v == null || v.trim().length < 2) ? 'Enter your name' : null,
              ),
              const SizedBox(height: 12),
              _Field(
                controller: _emailCtr,
                label: 'Email',
                keyboardType: TextInputType.emailAddress,
                validator: (v) => (v == null || !v.contains('@'))
                    ? 'Enter a valid email'
                    : null,
              ),
              const SizedBox(height: 12),
              _Field(
                controller: _phoneCtr,
                label: 'Phone Number',
                keyboardType: TextInputType.phone,
                maxLength: 10,
                validator: (v) =>
                    (v == null || v.trim().length != 10) ? 'Enter 10-digit number' : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: _subject,
                decoration: const InputDecoration(
                  labelText: 'Subject',
                  border: OutlineInputBorder(),
                ),
                items: kSupportSubjects
                    .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                    .toList(),
                onChanged: (v) => setState(() => _subject = v),
              ),
              const SizedBox(height: 12),
              _Field(
                controller: _msgCtr,
                label: 'Message',
                maxLines: 5,
                maxLength: 5000,
                validator: (v) =>
                    (v == null || v.trim().length < 10) ? 'Message too short' : null,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.orange,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Submit',
                          style: TextStyle(fontSize: 16, color: Colors.white)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final TextInputType? keyboardType;
  final int? maxLines;
  final int? maxLength;
  final String? Function(String?)? validator;

  const _Field({
    required this.controller,
    required this.label,
    this.keyboardType,
    this.maxLines = 1,
    this.maxLength,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      maxLength: maxLength,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        counterText: '',
      ),
    );
  }
}
```

---

#### 3. Navigate to Support Screen

```dart
// Generic — from help/support menu
Navigator.push(
  context,
  MaterialPageRoute(builder: (_) => const SupportScreen()),
);

// Pre-filled from an order detail page
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => SupportScreen(initialSubject: 'Order Issue'),
  ),
);

// Pre-filled from a delivery tracking page
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => SupportScreen(initialSubject: 'Delivery Problem'),
  ),
);
```

---

## Invoice Download API

### Endpoint

```
GET /api/orders/:orderId/invoice
Authorization: Bearer <user_token>
```

`:orderId` is the **human-readable order ID** (e.g. `FST001`), not the MongoDB `_id`.

Returns a raw **PDF binary** (`application/pdf`). Only the user who placed the order can download it.

---

### Flutter Integration

```dart
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

Future<void> downloadInvoice(String orderId, String token) async {
  final res = await http.get(
    Uri.parse('https://api.fast2.in/api/orders/$orderId/invoice'),
    headers: {'Authorization': 'Bearer $token'},
  );

  if (res.statusCode == 200) {
    final dir  = await getTemporaryDirectory();
    final file = File('${dir.path}/invoice-$orderId.pdf');
    await file.writeAsBytes(res.bodyBytes);
    await OpenFilex.open(file.path);   // opens in device PDF viewer
  } else {
    throw Exception('Failed to download invoice');
  }
}
```

Add to `pubspec.yaml`:
```yaml
  path_provider: ^2.1.2
  open_filex: ^1.3.2
```

Call from the order detail page:
```dart
ElevatedButton.icon(
  onPressed: () => downloadInvoice(order.customId, authToken),
  icon: const Icon(Icons.download),
  label: const Text('Download Invoice'),
)
```

> The invoice is only available after the order is placed. For COD orders, the invoice reflects the cash amount paid by the customer.

---

## Checklist

**Live Tracking**
- [ ] Add `socket_io_client`, `google_maps_flutter`, `geolocator` to `pubspec.yaml`
- [ ] Enable Google Maps API key in `AndroidManifest.xml` and `AppDelegate.swift`
- [ ] Add location permissions to `AndroidManifest.xml` (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`)
- [ ] Add location permissions to `Info.plist` (`NSLocationWhenInUseUsageDescription`)
- [ ] For background location on driver app: add `ACCESS_BACKGROUND_LOCATION` (Android) and `NSLocationAlwaysUsageDescription` (iOS)
- [ ] Call `TrackingService().connect()` after user login
- [ ] Call `LocationService().startSharingLocation()` after driver accepts order
- [ ] Call `LocationService().stopSharingLocation()` after driver delivers order

**Invoice**
- [ ] Add `path_provider` and `open_filex` to `pubspec.yaml`
- [ ] Wire up "Download Invoice" button on Order Detail → `downloadInvoice(order.customId, token)`

**Support**
- [ ] Add `SupportService` and `SupportScreen` to user app
- [ ] Wire up "Contact Support" entry in Help/Profile menu → `SupportScreen()`
- [ ] Wire up "Report Issue" button on Order Detail → `SupportScreen(initialSubject: 'Order Issue')`
- [ ] Wire up "Report Issue" button on Tracking Screen → `SupportScreen(initialSubject: 'Delivery Problem')`
- [ ] Show `referenceNumber` in success dialog so user can follow up
