# Scratch Card API — User Documentation

## Overview

When your order total exceeds **₹200**, you automatically receive a scratch card. You can scratch it **immediately after placing the order** to reveal a **coupon code** that you can redeem on any upcoming order.

---

## Endpoints

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | GET | `/api/order/my-scratch-coupons` | View history of all scratch card coupons |
| 2 | POST | `/api/order/:orderId/scratch-coupon` | Scratch a card to reveal the coupon code |
| 3 | POST | `/api/order/create` | Place a new order (handling charge auto-applied; pass `scratchCouponCode` to redeem) |
| 4 | POST | `/api/order/redeem-scratch-coupon` | Preview scratch coupon discount before placing order (optional) |

---

## Handling Charge

A handling charge of **₹2 per shop** is automatically added to every order based on the number of distinct shops (sellers) involved.

| Shops in order | Handling charge |
|:--------------:|:---------------:|
| 1 | ₹2 |
| 2 | ₹4 |
| 3 | ₹6 |
| N | ₹N × 2 |

**Price breakdown order:**
```
subtotal
+ deliveryCharges
+ handlingCharge     ← ₹2 × number of shops
─────────────────
= total
+ totalGst
- couponDiscount     (if coupon applied)
- scratchCouponDiscount (if scratchCouponCode applied)
─────────────────
= finalAmount
- walletDeduction    (if useWallet: true)
─────────────────
= cashOnDelivery / razorpay amount
```

The `handlingCharge` and `numberOfShops` fields are returned in the order response so the frontend can show a breakdown to the user.

---

## 1. Get Scratch Coupon History
**GET** `/api/order/my-scratch-coupons`

**Auth:** Required (Bearer Token)

Returns all scratch cards the user has received across all orders, along with their scratch and redemption status. Use this to build a "My Coupons" screen.

**Example Request**
```
GET /api/order/my-scratch-coupons
Authorization: Bearer <token>
```

**Success Response** `200`
```json
{
  "success": true,
  "total": 2,
  "scratchCoupons": [
    {
      "orderId": "FST042",
      "orderDate": "2026-04-03T10:22:00.000Z",
      "orderTotal": 450,
      "couponCode": "SAVE50NOW",
      "isScratched": true,
      "scratchedAt": "2026-04-03T11:00:00.000Z",
      "isRedeemed": false,
      "redeemedAt": null,
      "status": "scratched"
    },
    {
      "orderId": "FST037",
      "orderDate": "2026-03-28T08:10:00.000Z",
      "orderTotal": 300,
      "couponCode": null,
      "isScratched": false,
      "scratchedAt": null,
      "isRedeemed": false,
      "redeemedAt": null,
      "status": "unscratched"
    }
  ]
}
```

**Scratch Coupon Status Values**

| `status` value | Meaning |
|----------------|---------|
| `"unscratched"` | Card received but not yet scratched |
| `"scratched"` | Card scratched, coupon code revealed and available to use |
| `"redeemed"` | Coupon code has been used on an order |

> `couponCode` is `null` for unscratched cards — only revealed once the card is scratched.

---

## 2. Scratch a Card
**POST** `/api/order/:orderId/scratch-coupon`

**Auth:** Required (Bearer Token)

**Params**

| Param     | Type   | Description          |
|-----------|--------|----------------------|
| `orderId` | String | The ID of your order |

**Example Request**
```
POST /api/order/FST037/scratch-coupon
Authorization: Bearer <token>
```

**Success Response** `200`
```json
{
  "success": true,
  "message": "Congratulations! Here is your coupon code.",
  "couponCode": "SAVE50NOW"
}
```

**If already scratched** `400`
```json
{
  "success": false,
  "message": "Scratch card already used",
  "couponCode": "SAVE50NOW"
}
```

**Error Responses**

| Status | Message                                    | Reason                                       |
|--------|--------------------------------------------|----------------------------------------------|
| `404`  | `Order not found`                          | Order doesn't exist or doesn't belong to you |
| `400`  | `No scratch card available for this order` | Order total was ₹200 or below                |
| `400`  | `Scratch card already used`                | Card was already scratched (coupon shown)    |

---

## 3. Apply Scratch Coupon on a New Order
**POST** `/api/order/create`

**Auth:** Required (Bearer Token)

Pass `scratchCouponCode` in the create-order request body to apply the discount directly while placing the order. The scratch card is automatically marked as redeemed once the order is saved successfully.

> This is the **recommended way** to redeem a scratch card coupon. Use endpoint 4 only if you need to preview the discount before placing the order.

**Request Body**

```json
{
  "items": [...],
  "shippingAddress": {...},
  "paymentMethod": "cod",
  "scratchCouponCode": "SAVE50NOW"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `scratchCouponCode` | String | No | Coupon code revealed from a scratch card |

All other `createOrder` fields remain unchanged. `scratchCouponCode` is optional and stacks on top of any regular `coupon` discount and wallet deduction.

**Discount application order:**
1. Regular coupon discount (if `coupon` is passed)
2. Scratch card coupon discount (if `scratchCouponCode` is passed)
3. Wallet deduction (if `useWallet: true`)

**Success Response** `201`
```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "orderId": "FST043",
    "subtotal": 500,
    "deliveryCharges": 0,
    "isFreeDelivery": true,
    "handlingCharge": 4,
    "numberOfShops": 2,
    "total": 504,
    "totalGst": 25,
    "finalAmount": 479,
    "walletDeduction": 0,
    "cashOnDelivery": 479,
    "scratchCouponApplied": {
      "code": "SAVE50NOW",
      "discountType": "fixed",
      "discountValue": 50,
      "discountAmount": 50
    },
    ...
  }
}
```

**Error Responses**

| Status | Message | Reason |
|--------|---------|--------|
| `400` | `Invalid or already redeemed scratch card coupon` | Code not found, not scratched, or already used |
| `400` | `Coupon is expired or not yet active` | Coupon date range has passed |
| `400` | `Minimum order amount should be ₹X` | Order total is below the coupon's minimum |

---

## 4. Preview Scratch Coupon Discount
**POST** `/api/order/redeem-scratch-coupon`

**Auth:** Required (Bearer Token)

Call this at checkout when the user wants to apply their scratch card coupon to a new order. Only the user who received the scratch card can redeem it, and only once.

**Request Body**

```json
{
  "couponCode": "SAVE50NOW",
  "orderAmount": 500
}
```

| Field         | Type   | Required | Description                        |
|---------------|--------|----------|------------------------------------|
| `couponCode`  | String | Yes      | Coupon code revealed after scratch |
| `orderAmount` | Number | Yes      | Total amount of the new order      |

**Success Response** `200`
```json
{
  "success": true,
  "message": "Scratch card coupon applied successfully",
  "coupon": {
    "code": "SAVE50NOW",
    "description": "Flat ₹50 off on your next order",
    "discountType": "fixed",
    "discountValue": 50,
    "discountAmount": 50
  },
  "orderAmount": 500,
  "discount": 50,
  "finalAmount": 450
}
```

**Error Responses**

| Status | Message                                          | Reason                                            |
|--------|--------------------------------------------------|---------------------------------------------------|
| `400`  | `couponCode and orderAmount are required`        | Missing body fields                               |
| `404`  | `No scratch card found for this coupon code`     | Code doesn't belong to this user or not scratched |
| `400`  | `This scratch card coupon has already been redeemed` | Already used once                             |
| `400`  | `Coupon is expired or not yet active`            | Coupon date range invalid                         |
| `400`  | `Minimum order amount should be ₹X`              | New order total too low for this coupon           |

---

## How It Works

1. Place an order with a total amount **above ₹200** → scratch card is automatically assigned
2. On the order confirmation screen, scratch the card (`POST /api/order/:orderId/scratch-coupon`) → coupon code is revealed
3. Show the user their available coupons anytime via `GET /api/order/my-scratch-coupons`
4. At checkout for the next order, pass `scratchCouponCode` in the create-order body
5. Discount is applied automatically and the card is marked as redeemed

**Recommended Frontend Flow**

```
Order Placed (> ₹200)
  └─> Show scratch card UI on order confirmation
        └─> User scratches → POST /scratch-coupon → reveal code
              └─> "My Coupons" screen → GET /my-scratch-coupons
                    └─> User selects coupon at checkout
                          └─> POST /create { scratchCouponCode: "SAVE50NOW" }
                                └─> Response includes handlingCharge + numberOfShops for breakdown UI
```

---

## Scratch Card Object (in Order Response)

```json
"orderScratchCard": {
  "isEligible": true,
  "couponCode": "SAVE50NOW",
  "isScratched": false,
  "scratchedAt": null,
  "isRedeemed": false,
  "redeemedAt": null
}
```

| Field         | Description                                            |
|---------------|--------------------------------------------------------|
| `isEligible`  | `true` if order total exceeded ₹200                    |
| `couponCode`  | Revealed after scratching                              |
| `isScratched` | `true` once the card has been scratched                |
| `scratchedAt` | Timestamp of scratch                                   |
| `isRedeemed`  | `true` once the coupon has been used on a new order    |
| `redeemedAt`  | Timestamp of redemption                                |

---

## Rules

- Scratch card is assigned only when **order total > ₹200**
- Each card can be scratched **only once**
- Coupon can be redeemed **only once** by the user who received it
- No other user can redeem someone else's scratch card coupon
- One scratch card per order
- `scratchCouponCode` and a regular `coupon` can both be applied in the same order (they stack)
- `couponCode` is hidden in `GET /my-scratch-coupons` until the card is scratched
- **Handling charge is ₹2 per shop** and is always applied automatically — it cannot be waived
- Handling charge is added to `total` before GST and discounts are calculated
