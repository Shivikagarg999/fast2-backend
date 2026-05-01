
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
  static const _baseUrl = 'http://localhost:5000';

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
    Uri.parse('http://localhost:5000/api/orders/$orderId/invoice'),
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
