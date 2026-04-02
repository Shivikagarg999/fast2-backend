# Scratch Card API — User Documentation

## Overview

When your order total exceeds **₹200**, you automatically receive a scratch card. After your order is delivered, scratch the card to reveal a **coupon code** that you can redeem on your next order.

---

## API

### Scratch a Card
**POST** `/orders/:orderId/scratch-coupon`

**Auth:** Required (Bearer Token)

**Params**

| Param     | Type   | Description          |
|-----------|--------|----------------------|
| `orderId` | String | The ID of your order |

**Example Request**
```
POST /orders/ORD-123456/scratch-coupon
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

| Status | Message                                         | Reason                                       |
|--------|-------------------------------------------------|----------------------------------------------|
| `404`  | `Order not found`                               | Order doesn't exist or doesn't belong to you |
| `400`  | `Scratch card is only available after delivery` | Order not yet delivered                       |
| `400`  | `No scratch card available for this order`      | Order total was ₹200 or below                |
| `400`  | `Scratch card already used`                     | Card was already scratched (coupon shown)    |

---

## How It Works

1. Place an order with a total amount **above ₹200**
2. A scratch card with a coupon code is automatically assigned to your order
3. Once your order status becomes **delivered**, scratch the card
4. The coupon code is revealed — use it on your next order at checkout

---

## Scratch Card Object (in Order Response)

```json
"orderScratchCard": {
  "isEligible": true,
  "couponCode": "SAVE50NOW",
  "isScratched": false,
  "scratchedAt": null
}
```

| Field         | Description                                              |
|---------------|----------------------------------------------------------|
| `isEligible`  | `true` if order total exceeded ₹200                      |
| `couponCode`  | Hidden until scratched — revealed on scratch             |
| `isScratched` | `true` if already scratched                              |
| `scratchedAt` | Timestamp of when it was scratched (`null` if not yet)   |

---

## Rules

- Scratch card is assigned only when **order total > ₹200**
- Card can only be scratched **after delivery**
- Each scratch card can be scratched **only once**
- One scratch card per order
- The revealed coupon code can be applied at checkout on your next order
