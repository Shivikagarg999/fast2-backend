# Scratch Card API Documentation

## Overview

When a user places an order with a total exceeding **₹200**, a scratch card is automatically assigned to the order. The scratch card contains a **coupon code** (randomly picked from active coupons created by admin). The user can scratch the card after delivery to reveal the coupon and use it on future orders.

---

## Flow

```
Admin creates coupon → User places order > ₹200 → Scratch card auto-assigned
→ Order delivered → User scratches card → Coupon code revealed → User redeems on next order
```

---

## Admin — Manage Coupons for Scratch Cards

Scratch card coupons are regular coupons created by the admin. When an eligible order is placed, the system picks a **random active coupon** from the coupon pool and assigns it as the scratch card reward.

### Coupon APIs (used for scratch card pool)

| Method   | Route                              | Description                  |
|----------|------------------------------------|------------------------------|
| `POST`   | `/admin/coupons`                   | Create a new coupon          |
| `GET`    | `/admin/coupons`                   | Get all coupons              |
| `PUT`    | `/admin/coupons/:couponId`         | Update a coupon              |
| `DELETE` | `/admin/coupons/:couponId`         | Delete a coupon              |
| `PATCH`  | `/admin/coupons/:couponId/toggle`  | Activate / deactivate coupon |

> A coupon is eligible to be awarded as a scratch card gift if it is **active** and within its **valid date range**.

### Create Coupon — Request Body

```json
{
  "code": "SAVE50NOW",
  "description": "Flat ₹50 off on your next order",
  "discountType": "fixed",
  "discountValue": 50,
  "minOrderAmount": 200,
  "maxDiscountAmount": null,
  "startDate": "2026-04-01T00:00:00.000Z",
  "endDate": "2026-06-30T23:59:59.000Z",
  "usageLimit": 1000,
  "perUserLimit": 1,
  "applicableCategories": [],
  "excludedProducts": []
}
```

| Field                 | Type     | Description                                               |
|-----------------------|----------|-----------------------------------------------------------|
| `code`                | String   | Unique coupon code (auto-uppercased)                      |
| `description`         | String   | Description shown to user                                 |
| `discountType`        | String   | `percentage` or `fixed`                                   |
| `discountValue`       | Number   | Discount amount or percentage                             |
| `minOrderAmount`      | Number   | Minimum order value to apply (default: 0)                 |
| `maxDiscountAmount`   | Number   | Cap on discount for percentage types (optional)           |
| `startDate`           | Date     | When the coupon becomes active                            |
| `endDate`             | Date     | When the coupon expires                                   |
| `usageLimit`          | Number   | Max total uses across all users (null = unlimited)        |
| `perUserLimit`        | Number   | Max times one user can use this coupon (default: 1)       |
| `applicableCategories`| ObjectId[]| Restrict to specific categories (empty = all)            |
| `excludedProducts`    | ObjectId[]| Products excluded from this coupon (empty = none)        |

---

## How Scratch Cards Are Auto-Assigned (Order Creation)

When an order is created with **subtotal > ₹200**, the system:

1. Finds all active coupons within their valid date range
2. Picks one at random
3. Attaches it to the order's `orderScratchCard` field

```js
// Eligibility check in createOrder
if (subtotal > 199) {
  const picked = randomFrom(activeCoupons);
  orderScratchCard = {
    isEligible: true,
    couponCode: picked.code,
    isScratched: false,
    scratchedAt: null
  };
}
```

If no active coupons exist at the time of order, no scratch card is assigned (`isEligible: false`).

---

## User API

### Scratch a Card
**POST** `/orders/:orderId/scratch-coupon`

**Auth:** Required

**Params**

| Param     | Type   | Description  |
|-----------|--------|--------------|
| `orderId` | String | The order ID |

**Validations**
- Order must belong to the logged-in user
- `orderScratchCard.isEligible` must be `true`
- Card must not already be scratched

**Success Response** `200`
```json
{
  "success": true,
  "message": "Congratulations! Here is your coupon code.",
  "couponCode": "SAVE50NOW"
}
```

**Error Responses**

| Status | Message                                    | Reason                        |
|--------|--------------------------------------------|-------------------------------|
| `404`  | `Order not found`                          | Invalid order or wrong user   |
| `400`  | `No scratch card available for this order` | Order total was ≤ ₹200        |
| `400`  | `Scratch card already used`                | Already scratched (shows code)|

---

## Order Schema — `orderScratchCard` field

| Field         | Type    | Default | Description                                    |
|---------------|---------|---------|------------------------------------------------|
| `isEligible`  | Boolean | `false` | True if order total exceeded ₹200              |
| `couponCode`  | String  | `null`  | The assigned coupon code (hidden until scratch) |
| `isScratched` | Boolean | `false` | Whether the card has been scratched             |
| `scratchedAt` | Date    | `null`  | Timestamp of scratch                           |

---

## Business Rules

- Scratch card is assigned when **order subtotal > ₹200**
- The coupon is randomly picked from **all active, in-date coupons**
- Scratch is available **immediately after placing the order**
- Each order has **one scratch card**
- Each card can be scratched **only once**
- The coupon code is **hidden** in the order response until scratched
- Revealed coupon code can be applied at checkout on any future order
