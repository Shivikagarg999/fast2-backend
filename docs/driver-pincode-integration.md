# Driver Pincode Integration Guide

## Overview

When a driver opens the app and goes online, their **current pincode** must be sent to the backend. The backend uses this pincode to filter which drivers receive order rings — only drivers whose saved pincode matches the customer's delivery address pincode will be notified.

---

## What You Need to Do

There are **two places** where the pincode must be sent:

1. **REST API** — when the driver taps "Go Online"
2. **Socket event** — when the driver app connects/reconnects to the socket

---

## Step 1: Get the Driver's Pincode

Before going online, the app must have the driver's current pincode. You can get this by:

- Asking the driver to enter/confirm their pincode on the home screen or profile screen
- Reading it from their saved profile (`address.currentAddress.pinCode`)
- Using the device's location to auto-detect the pincode (optional enhancement)

Store this pincode locally (e.g. SharedPreferences / local storage) so it is available when the socket connects.

---

## Step 2: Send Pincode via REST API (Go Online)

When the driver taps the **"Go Online"** toggle, call:

```
PATCH /api/driver/availability
Authorization: Bearer <driver_token>
Content-Type: application/json
```

**Request body (before this change):**
```json
{
  "availability": "online"
}
```

**Request body (updated — add pincode):**
```json
{
  "availability": "online",
  "pincode": "110001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Driver is now online",
  "data": {
    "driverId": "abc123",
    "availability": "online",
    "currentPincode": "110001"
  }
}
```

> When going **offline**, pincode is not required — just send `{ "availability": "offline" }` as before.

---

## Step 3: Send Pincode via Socket (On Connect / Reconnect)

When the socket connects (or reconnects), emit the `driver_online` event.

**Before this change:**
```dart
socket.emit('driver_online', driverId);
```

**Updated — send as an object with pincode:**
```dart
socket.emit('driver_online', {
  'driverId': driverId,
  'pincode': '110001',
});
```

> The backend still supports the old plain-string format (`socket.emit('driver_online', driverId)`) for backward compatibility, but the pincode will not be updated if sent that way. Always send the object format.

---

## Step 4: Where to Call These (Trigger Points)

| Trigger | Action |
|---|---|
| Driver taps "Go Online" toggle | Call `PATCH /availability` with `pincode` |
| Socket `connect` event fires | Emit `driver_online` with `{ driverId, pincode }` |
| Socket `reconnect` event fires | Emit `driver_online` with `{ driverId, pincode }` again |

**Flutter/Dart example (socket setup):**

```dart
socket.onConnect((_) {
  socket.emit('driver_online', {
    'driverId': driverId,
    'pincode': currentPincode,  // read from local storage or driver profile
  });
});

socket.onReconnect((_) {
  socket.emit('driver_online', {
    'driverId': driverId,
    'pincode': currentPincode,
  });
});
```

---

## Step 5: Where to Get the Pincode Value

The pincode should come from the driver's saved address in their profile. It is already stored in the backend under:

```
driver.address.currentAddress.pinCode
```

On app startup (after login), fetch the driver profile and save `address.currentAddress.pinCode` locally. Use this value whenever going online or connecting via socket.

If the driver has not filled their address/pincode yet, show a prompt asking them to enter it before they can go online.

---

## Summary Checklist for Frontend Dev

- [ ] Read `address.currentAddress.pinCode` from driver profile on login
- [ ] Store pincode in local storage / state management
- [ ] When driver taps **Go Online**: send `{ availability: "online", pincode: "XXXXXX" }` to `PATCH /api/driver/availability`
- [ ] On socket **connect**: emit `driver_online` as `{ driverId, pincode }` (object, not plain string)
- [ ] On socket **reconnect**: same as above
- [ ] If pincode is not set, prompt the driver to fill their address before going online

---

## Why This Is Needed

Orders are now only sent to drivers whose pincode matches the customer's delivery pincode. A driver in Delhi (110001) will **not** receive a ring for an order being delivered in Mumbai (400001). This reduces unnecessary noise and ensures only the right drivers get notified.
