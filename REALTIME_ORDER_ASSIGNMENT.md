# Real-Time Order Assignment System

Socket.IO-based incoming order "call" UI for delivery drivers.

---

## Architecture Overview

```
Customer places order
        │
        ▼
  Order Controller
  (createOrder)
        │
        ├── Socket: emitNewOrder()  ──► All online drivers (connected sockets)
        └── FCM:  notifyNearbyDrivers() ──► All online drivers (backgrounded/killed app)
                        │
            ┌───────────┴───────────┐
            │                       │
       Driver ACCEPTS           Driver DECLINES
            │                       │
     acceptOrder API           decline_order socket
     (PATCH /orders/:id/accept) or PATCH /orders/:id/decline
            │                       │
            ▼                       ▼
   emitOrderTaken()         recordDecline()
   notifyOrderTaken()              │
            │               All declined?
   ┌────────┴────────┐             │
   │                 │           YES ▼
order_taken      stop_ringing   all_drivers_declined
(other drivers)  (accepting     (emitted to _admin room)
                  driver)
```

---

## Socket Events

### Driver → Server

| Event | Payload | When to emit |
|---|---|---|
| `driver_online` | `driverId: string` | App starts / reconnects |
| `decline_order` | `{ orderId, driverId }` | Driver taps Decline |

### Server → Driver

| Event | Payload | What to do in Flutter |
|---|---|---|
| `new_order` | `{ orderId, orderCustomId }` | Show full-screen incoming order screen |
| `stop_ringing` | `{ orderId }` | Dismiss the incoming order screen |
| `order_taken` | `{ orderId, orderCustomId }` | Dismiss (another driver accepted) |

### Server → Admin

| Event | Payload | Meaning |
|---|---|---|
| `all_drivers_declined` | `{ orderId }` | All notified drivers declined — manual intervention needed |

---

## REST Endpoints

### Accept Order
```
PATCH /api/driver/orders/:orderId/accept
Authorization: Bearer <driver_token>
```
**Response**
```json
{
  "success": true,
  "message": "Order accepted successfully",
  "data": { "orderId": "...", "orderCustomId": "FST042", "driverId": "..." }
}
```

### Decline Order (HTTP fallback)
```
PATCH /api/driver/orders/:orderId/decline
Authorization: Bearer <driver_token>
```
Use this when the socket is unavailable (reconnection scenarios).
**Response**
```json
{ "success": true, "message": "Order declined" }
```

---

## Flutter Integration

### 1. Connect and register

```dart
final socket = IO.io('https://your-api.com', {
  'transports': ['websocket'],
  'autoConnect': false,
});

socket.connect();
socket.emit('driver_online', driverId);
```

### 2. Listen for incoming orders

```dart
socket.on('new_order', (data) {
  final orderId = data['orderId'];
  final orderCustomId = data['orderCustomId'];
  // Navigate to full-screen incoming order UI
  Navigator.push(context, MaterialPageRoute(
    builder: (_) => IncomingOrderScreen(orderId: orderId, orderCustomId: orderCustomId),
  ));
});
```

### 3. Accept

```dart
// Call REST API
await apiClient.patch('/driver/orders/$orderId/accept');
// Server will emit stop_ringing back to this driver
// and order_taken to all others
```

### 4. Decline

```dart
// Preferred: socket (instant)
socket.emit('decline_order', { 'orderId': orderId, 'driverId': driverId });

// Fallback: REST
await apiClient.patch('/driver/orders/$orderId/decline');
```

### 5. Dismiss incoming screen

```dart
socket.on('stop_ringing', (data) {
  if (data['orderId'] == currentOrderId) Navigator.pop(context);
});

socket.on('order_taken', (data) {
  if (data['orderId'] == currentOrderId) Navigator.pop(context);
});
```

### 6. Admin — listen for all-declined

```dart
socket.on('all_drivers_declined', (data) {
  // Show alert: no drivers available for orderId
  showAdminAlert('Order ${data["orderId"]} has no available drivers.');
});
```

---

## Fallback Behavior

| Scenario | Handled by |
|---|---|
| App backgrounded / killed | FCM via `notifyNearbyDrivers` + `notifyOrderTaken` |
| Driver reconnects mid-order | `driver_online` handler replays recent pending orders |
| No socket connection on decline | `PATCH /orders/:id/decline` REST endpoint |
| All drivers decline | `all_drivers_declined` event → admin room |
| Order accepted while others ringing | `order_taken` socket + `notifyOrderTaken` FCM |

---

## Files Changed

| File | Change |
|---|---|
| `socketManager.js` | Added decline tracking maps, `recordDecline()`, all-declined fallback, cleanup in `emitOrderTaken` |
| `services/driverNotificationService.js` | Added `notifyOrderTaken()` — FCM to other drivers on accept |
| `controllers/driver/driverControllers.js` | Added `declineOrder` HTTP endpoint |
| `routes/driver/driverRoutes.js` | Registered `PATCH /orders/:orderId/decline` |
