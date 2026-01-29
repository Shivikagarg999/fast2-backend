# Flutter Notification Integration Guide

This guide outlines the changes required in the Flutter application to support the new Notification System (In-App + Firebase Push Notifications).

## 1. Dependencies
Ensure you have the following package installed:
- `firebase_messaging`

## 2. Token Registration (Critical)
**When:** On every app launch or successful login.

The backend `User` model now has an `fcmToken` field. You must send the Firebase device token to the backend so we can target this specific user.

**Action:**
1. Get the token from Firebase Messaging:
   ```dart
   String? token = await FirebaseMessaging.instance.getToken();
   ```
2. Call the **Update Profile API** to save it:
   - **Endpoint:** `PUT /api/user/profile`
   - **Headers:** `Authorization: Bearer <user_token>`
   - **Body:**
     ```json
     {
       "fcmToken": "your_firebase_token_here"
     }
     ```

## 3. Handling Incoming Push Notifications
The backend sends a data payload with every notification to help you navigate users to the right screen.

**Payload Structure:**
```json
{
  "notification": {
    "title": "Order Placed",
    "body": "Your order #12345 has been placed."
  },
  "data": {
    "type": "order",          // Enum: 'order', 'wallet', 'delivery', 'promo', 'system'
    "referenceId": "12345",   // ID to fetch details (e.g., Order ID)
    "click_action": "FLUTTER_NOTIFICATION_CLICK"
  }
}
```

**Navigation Logic (Example):**
When a user taps a notification (terminated or background state):
1. Check `message.data['type']`.
2. Check `message.data['referenceId']`.
3. Navigate accordingly:
   - If `type == 'order'` -> Go to **Order Details Screen** (using `referenceId`).
   - If `type == 'wallet'` -> Go to **Wallet Screen**.
   - If `type == 'promo'` -> Go to **Offers Screen**.

## 4. In-App Notification Center
We have created new APIs to list notifications inside the app (e.g., a "Bell" icon screen).

### A. Fetch Notifications
- **Endpoint:** `GET /api/notifications`
- **Params:** `?page=1&limit=20`
- **Response:**
  ```json
  {
    "success": true,
    "hasMore": true,
    "notifications": [
      {
        "id": "651a...",
        "title": "Order Shipped",
        "body": "Your order is on the way",
        "type": "order",         // Use this for icon/routing
        "referenceId": "555",    // Use this for routing
        "date": "2023-10-27...",
        "isRead": false
      }
    ]
  }
  ```

### B. Get Unread Count (For Badge)
- **Endpoint:** `GET /api/notifications/unread-count`
- **Response:** `{ "success": true, "count": 5 }`

### C. Mark All Read
- **Endpoint:** `PUT /api/notifications/mark-all-read`
- **Action:** Call this when the user opens the notification screen.

## Summary Checklist
- [ ] Send `fcmToken` to backend on Login/Startup.
- [ ] Handle `data.type` and `data.referenceId` for deep linking/navigation.
- [ ] Build a "Notifications" screen using the new Fetch API.
- [ ] Show a red badge count using the Unread Count API.
