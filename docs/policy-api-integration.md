# Policy API Integration Guide (Mobile App)

## Overview

Admin dwara create ki gayi saari policies (Terms, Return, Cancellation, Refund) ek hi API call se fetch ho jaati hain. App mein WebView ya HTML renderer se content display karo.

---

## Base URL

```
https://api.GMKart.in
```

---

## Endpoints

### 1. Get All Active Policies (Recommended)

Ek call mein chaaro types ek saath milti hain.

```
GET /api/policy/active
```

**Auth Required:** No  
**Method:** GET

**Response:**

```json
{
  "success": true,
  "data": {
    "terms": {
      "_id": "664abc...",
      "title": "Terms & Conditions",
      "content": "<p>HTML content here...</p>",
      "version": "1.0",
      "effectiveDate": "2024-01-01T00:00:00.000Z",
      "policyType": "terms",
      "isActive": true,
      "metadata": {
        "contactEmail": "support@GMKart.in"
      }
    },
    "return": {
      "_id": "664def...",
      "title": "Return Policy",
      "content": "<p>HTML content here...</p>",
      "version": "1.1",
      "effectiveDate": "2024-01-01T00:00:00.000Z",
      "policyType": "return",
      "isActive": true,
      "metadata": {
        "returnPeriod": 7,
        "contactEmail": "support@GMKart.in"
      }
    },
    "cancellation": {
      "_id": "664ghi...",
      "title": "Cancellation Policy",
      "content": "<p>HTML content here...</p>",
      "version": "1.0",
      "effectiveDate": "2024-01-01T00:00:00.000Z",
      "policyType": "cancellation",
      "isActive": true,
      "metadata": {
        "cancellationFee": 10,
        "contactEmail": "support@GMKart.in"
      }
    },
    "refund": {
      "_id": "664jkl...",
      "title": "Refund Policy",
      "content": "<p>HTML content here...</p>",
      "version": "1.2",
      "effectiveDate": "2024-01-01T00:00:00.000Z",
      "policyType": "refund",
      "isActive": true,
      "metadata": {
        "refundProcessingDays": 5,
        "contactEmail": "support@GMKart.in"
      }
    }
  }
}
```

**Note:** Agar admin ne kisi type ki policy abhi activate nahi ki, to wo key `null` aayegi.

---

### 2. Get Single Policy By Type

Agar sirf ek specific policy chahiye.

```
GET /api/policy/active/:policyType
```

**Auth Required:** No  
**Method:** GET

| Param        | Type   | Required | Values                                      |
|--------------|--------|----------|---------------------------------------------|
| `policyType` | string | Yes      | `terms` / `return` / `cancellation` / `refund` |

**Examples:**

```
GET /api/policy/active/terms
GET /api/policy/active/return
GET /api/policy/active/cancellation
GET /api/policy/active/refund
```

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "664abc...",
    "title": "Return Policy",
    "content": "<p>HTML content here...</p>",
    "version": "1.1",
    "effectiveDate": "2024-01-01T00:00:00.000Z",
    "policyType": "return",
    "isActive": true,
    "metadata": {
      "returnPeriod": 7,
      "contactEmail": "support@GMKart.in"
    }
  }
}
```

**404 Response (policy active nahi hai):**

```json
{
  "success": false,
  "message": "No active return policy found"
}
```

---

## Response Fields

| Field                        | Type    | Description                                  |
|------------------------------|---------|----------------------------------------------|
| `_id`                        | string  | Policy ka unique ID                          |
| `title`                      | string  | Policy ka naam                               |
| `content`                    | string  | Policy ka HTML content (WebView mein render) |
| `version`                    | string  | Current version                              |
| `effectiveDate`              | string  | ISO date — kab se lagu hai                  |
| `policyType`                 | string  | `terms` / `return` / `cancellation` / `refund` |
| `isActive`                   | boolean | Hamesha `true` hoga (active endpoint hai)   |
| `metadata.returnPeriod`      | number  | Return ke liye kitne din (return policy)    |
| `metadata.cancellationFee`   | number  | Cancellation charge % (cancellation policy) |
| `metadata.refundProcessingDays` | number | Refund kitne din mein aayega (refund policy)|
| `metadata.contactEmail`      | string  | Contact email                                |

---

## App Integration Flow

```
Screen Load
    |
    v
GET /api/policy/active  (ek hi call)
    |
    v
Response Store karo:
  - data.terms
  - data.return
  - data.cancellation
  - data.refund
    |
    v
4 Tabs Show karo:
  [Terms]  [Return]  [Cancellation]  [Refund]
    |
    v
Tab select → us type ka content WebView mein render karo
```

---

## Tab Labels

| policyType     | Tab Label             |
|----------------|-----------------------|
| `terms`        | Terms & Conditions    |
| `return`       | Return Policy         |
| `cancellation` | Cancellation Policy   |
| `refund`       | Refund Policy         |

---

## Metadata Display (Optional)

Agar metadata fields present hain to inhe policy content ke upar highlight box mein dikhao:

| Field                       | Display Label         | Example Value     |
|-----------------------------|-----------------------|-------------------|
| `metadata.returnPeriod`     | Return Period         | 7 days            |
| `metadata.cancellationFee`  | Cancellation Fee      | 10%               |
| `metadata.refundProcessingDays` | Refund Processing | 5 business days   |
| `metadata.contactEmail`     | Contact Email         | support@GMKart.in  |

---

## Error Handling

| Scenario                        | `success` | Action                              |
|---------------------------------|-----------|-------------------------------------|
| API call success                | `true`    | Data show karo                      |
| Specific type null hai          | `true`    | "Policy coming soon" message dikhao |
| 404 — policy active nahi        | `false`   | "Not available" message dikhao      |
| 500 — server error              | `false`   | "Something went wrong, try again"   |
| Network error                   | —         | "No internet connection" dikhao     |

---

## Content Rendering

`content` field ek **HTML string** hai (TinyMCE editor se aata hai). App mein render karne ke liye:

- **React Native:** `react-native-webview` use karo
- **Flutter:** `flutter_html` ya `webview_flutter` package
- **Android Native:** `WebView` component
- **iOS Native:** `WKWebView`

**React Native Example:**

```jsx
import { WebView } from 'react-native-webview';

<WebView
  originWhitelist={['*']}
  source={{ html: policy.content }}
  style={{ flex: 1 }}
/>
```

**Flutter Example:**

```dart
import 'package:flutter_html/flutter_html.dart';

Html(
  data: policy['content'],
)
```

---

## Complete API Call Example (React Native)

```js
const fetchPolicies = async () => {
  try {
    const response = await fetch('https://api.GMKart.in/api/policy/active');
    const data = await response.json();

    if (data.success) {
      setPolicies(data.data); // { terms, return, cancellation, refund }
    }
  } catch (error) {
    console.error('Policy fetch failed:', error);
  }
};
```

---

## Complete API Call Example (Flutter/Dart)

```dart
Future<void> fetchPolicies() async {
  final response = await http.get(
    Uri.parse('https://api.GMKart.in/api/policy/active'),
  );

  final data = jsonDecode(response.body);

  if (data['success'] == true) {
    setState(() {
      policies = data['data'];
    });
  }
}
```
