# Scratch Card API — User Documentation

## Overview

When your order total exceeds **₹200**, you automatically receive a scratch card. You can scratch it **immediately after placing the order** to reveal a **coupon code** that you can redeem on your next order.

---

## 1. Scratch a Card
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

## 2. Redeem Scratch Card Coupon
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

1. Place an order with a total amount **above ₹200**
2. A scratch card is automatically assigned to your order
3. Scratch the card **immediately** from the order confirmation screen → coupon code is revealed
4. At checkout for your next order, apply the coupon code
5. Call `POST /api/order/redeem-scratch-coupon` to validate and get the discount
6. Place the new order with the discounted `finalAmount`

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
- Card can be scratched **immediately after placing the order**
- Each card can be scratched **only once**
- Coupon can be redeemed **only once** by the user who received it
- No other user can redeem someone else's scratch card coupon
- One scratch card per order
