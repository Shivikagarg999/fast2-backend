# Cashfree + Payment Gateway Toggle — Flutter App Changes

This documents what the Flutter mobile app needs to implement to match the
Cashfree + admin payment-gateway-toggle work already shipped in
`fast2-backend`, `fast2-frontend`, and `fast2-admin`. The backend is the
source of truth — all endpoints below already exist and are live.

## 1. Backend API contract (already deployed, nothing to build here)

### `GET /api/order/payment-options` (no auth)
Call this before showing the checkout screen's payment method options.
```json
{
  "success": true,
  "activeGateway": "razorpay" | "cashfree" | "none",
  "onlinePaymentEnabled": true,
  "cashfreeMode": "sandbox" | "production"
}
```
- If `onlinePaymentEnabled` is `false`, hide the "Pay Online" option entirely — only Cash on Delivery should be selectable.
- `cashfreeMode` tells you which `CFEnvironment` to initialize the Cashfree SDK with.

### `POST /api/order/create` (existing endpoint, response shape extended)
Same request body as today (`items`, `shippingAddress`, `paymentMethod`, `useWallet`, etc). The response now contains **either** a `razorpay` block **or** a `cashfree` block under `order`, depending on which gateway is active — never both:
```json
// when activeGateway === "razorpay" (unchanged from today)
"order": { "...": "...", "razorpay": { "orderId": "...", "amount": 19900, "currency": "INR", "key": "rzp_..." } }

// when activeGateway === "cashfree" (new)
"order": { "...": "...", "cashfree": { "orderId": "...", "paymentSessionId": "...", "amount": 199, "currency": "INR" } }
```
Note the amount unit difference: Razorpay's `amount` is in **paise**, Cashfree's is in **rupees** — don't reuse the same parsing code for both.

### `POST /api/order/verify-cashfree-payment` (new, auth required)
Call this after the Cashfree SDK callback fires (Cashfree's mobile SDK doesn't hand back a signature like Razorpay does — this endpoint re-checks status server-side via Cashfree's API).
```json
// request
{ "orderId": "FST001" }

// response
{ "success": true, "orderId": "FST001", "paymentStatus": "paid" | "pending" | "failed", "cashfreeOrderStatus": "PAID" | "ACTIVE" | "EXPIRED" | "TERMINATED" }
```
Only treat the order as paid when `paymentStatus === "paid"`.

### `POST /api/order/verify-payment` (existing, unchanged)
Still used for Razorpay — same request/response as before.

## 2. New dependency

Add to `pubspec.yaml`:
```yaml
flutter_cashfree_pg_sdk: ^2.4.0   # check pub.dev for the latest version
```
`razorpay_flutter` should already be present if Razorpay checkout already works in the app — no change needed to it.

## 3. Native setup for Cashfree

**iOS** — add to `Info.plist` (lets the SDK deep-link into UPI apps):
```xml
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>amazonpay</string>
  <string>upi</string>
  <string>credpay</string>
  <string>bhim</string>
  <string>paytmmp</string>
  <string>phonepe</string>
  <string>tez</string>
  <string>navipay</string>
  <string>mobikwik</string>
  <string>myairtel</string>
  <string>popclubapp</string>
  <string>super</string>
  <string>kiwi</string>
  <string>simplypayupi</string>
  <string>whatsapp</string>
</array>
```
Minimum iOS deployment target: 11.0.

**Android** — minimum SDK version 19 (same floor `razorpay_flutter` already requires, so likely no change needed). No extra manifest entries documented by Cashfree beyond standard internet permission, which the app already has.

## 4. App logic changes

### a. Checkout screen init
On checkout screen load, call `GET /api/order/payment-options` and store `activeGateway`, `onlinePaymentEnabled`, `cashfreeMode` in screen state (same as the web checkout's new `paymentOptions` state in `fast2-frontend/src/app/checkout/page.jsx`).
- If `onlinePaymentEnabled` is `false`: don't render the "Pay Online" radio/card at all. Default selection stays Cash on Delivery.
- If `true`: render "Pay Online" as today, just swap the trust-badge logo based on `activeGateway` (Razorpay logo vs a generic "Secured by Cashfree" label) if the UI shows gateway branding.

### b. Order placement branching
After `POST /api/order/create` succeeds, check which key is present in the response (mirrors the same branch added to the web checkout):
- `order.razorpay` present → existing `razorpay_flutter` flow, **unchanged**.
- `order.cashfree` present → new flow (see below).

### c. New Cashfree payment flow
```dart
import 'package:flutter_cashfree_pg_sdk/cfpaymentgatewayservice.dart';
import 'package:flutter_cashfree_pg_sdk/utils/cfenums.dart';
import 'package:flutter_cashfree_pg_sdk/cfsession.dart';
import 'package:flutter_cashfree_pg_sdk/cfwebcheckoutpayment.dart';
import 'package:flutter_cashfree_pg_sdk/cferrorresponse.dart';

final cfPaymentGatewayService = CFPaymentGatewayService();

void startCashfreeCheckout(String orderId, String paymentSessionId, String cashfreeMode) {
  final environment = cashfreeMode == 'sandbox'
      ? CFEnvironment.SANDBOX
      : CFEnvironment.PRODUCTION;

  final session = CFSessionBuilder()
      .setEnvironment(environment)
      .setOrderId(orderId)
      .setPaymentSessionId(paymentSessionId)
      .build();

  final cfWebCheckout = CFWebCheckoutPaymentBuilder()
      .setSession(session)
      .build();

  cfPaymentGatewayService.setCallback(_onCashfreeVerify, _onCashfreeError);
  cfPaymentGatewayService.doPayment(cfWebCheckout);
}

void _onCashfreeVerify(String orderId) async {
  // POST /api/order/verify-cashfree-payment with { orderId }
  // on paymentStatus === "paid" -> navigate to order confirmation, clear cart
  // otherwise -> show error / let user retry
}

void _onCashfreeError(CFErrorResponse errorResponse, String orderId) {
  // treat like Razorpay's EVENT_PAYMENT_ERROR / modal-dismiss case —
  // show "payment cancelled/failed", let user retry without losing the order
}
```
This mirrors the existing `Razorpay()` → `.on(EVENT_PAYMENT_SUCCESS/ERROR)` → `.open(options)` pattern: build session → register callbacks → trigger payment → verify server-side on success.

### d. Cleanup
Call `cfPaymentGatewayService` teardown (if the SDK exposes one, check current pub.dev docs — `razorpay_flutter` requires `_razorpay.clear()` on dispose, Cashfree's SDK should be checked for an equivalent) when leaving the checkout screen, same as the existing Razorpay instance cleanup.

## 5. What does NOT change

- Cash on Delivery flow — untouched.
- Razorpay flow — untouched, just now conditionally shown based on `activeGateway`.
- Order creation request body — untouched.
- Existing `verify-payment` (Razorpay) endpoint — untouched.

## 6. Testing notes

- Backend `.env` currently has blank `CASHFREE_APP_ID`/`CASHFREE_SECRET_KEY` — a real end-to-end Cashfree payment can't be tested until those are filled in (sandbox keys recommended first).
- To test the toggle itself: use the admin panel's new "Payment Settings" page (`/admin/payment-settings`) to switch `activeGateway` between `razorpay`/`cashfree`/`none` and confirm the app's checkout screen reacts accordingly (hides online option when `none`, opens the right SDK otherwise).
