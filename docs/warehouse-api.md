# Warehouse API Documentation

**Base URL:** `/api/warehouse`

---

## Authentication

Protected endpoints require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <token>
```

The token is obtained from the **Login** endpoint and expires in **7 days**.

---

## Endpoints

### 1. Login

Authenticate a warehouse using its name and code.

**`POST /api/warehouse/login`**

**Auth required:** No

#### Request Body

| Field  | Type   | Required | Description                        |
|--------|--------|----------|------------------------------------|
| `name` | string | Yes      | Warehouse name (case-insensitive)  |
| `code` | string | Yes      | Unique warehouse code              |

```json
{
  "name": "Central Warehouse",
  "code": "WH001"
}
```

#### Success Response `200`

```json
{
  "success": true,
  "message": "Login successful",
  "token": "<jwt_token>",
  "warehouse": {
    "_id": "64abc123...",
    "name": "Central Warehouse",
    "code": "WH001",
    "warehouseManager": "John Doe",
    "contact": "9876543210",
    "location": {
      "address": "123 Main St",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "coordinates": { "lat": 19.076, "lng": 72.877 }
    },
    "storageType": "ambient",
    "capacity": 5000,
    "currentStock": 3200,
    "isActive": true,
    "promotor": {
      "_id": "64xyz...",
      "name": "Rahul Sharma",
      "email": "rahul@example.com",
      "phone": "9876543210"
    }
  }
}
```

#### Error Responses

| Status | Message                                       | Cause                           |
|--------|-----------------------------------------------|---------------------------------|
| `400`  | Warehouse name and code are required          | Missing `name` or `code`        |
| `401`  | Invalid warehouse name or code                | No matching warehouse found     |
| `403`  | Warehouse is inactive. Please contact support | `isActive` is false             |

---

### 2. Get Warehouse for Pincode

Find the nearest/best-matched active warehouse for a given pincode. Falls back to area code match, then any active warehouse.

**`GET /api/warehouse/for-pincode`**

**Auth required:** No

#### Query Parameters

| Param     | Type   | Required | Description           |
|-----------|--------|----------|-----------------------|
| `pincode` | string | Yes      | 6-digit pincode       |

```
GET /api/warehouse/for-pincode?pincode=400001
```

#### Success Response `200`

```json
{
  "success": true,
  "data": {
    "_id": "64abc123...",
    "name": "Central Warehouse",
    "code": "WH001",
    "location": { ... },
    "serviceablePincodes": ["400001", "400002"],
    "storageType": "ambient",
    "isActive": true
  }
}
```

#### Error Responses

| Status | Message                              | Cause                              |
|--------|--------------------------------------|------------------------------------|
| `400`  | Pincode is required                  | Missing `pincode` query param      |
| `404`  | No warehouse found for this pincode  | No active warehouse in the system  |

---

### 3. Get Profile

Get the full profile of the authenticated warehouse including its sellers and products.

**`GET /api/warehouse/profile`**

**Auth required:** Yes

#### Success Response `200`

```json
{
  "success": true,
  "warehouse": {
    "_id": "64abc123...",
    "name": "Central Warehouse",
    "code": "WH001",
    "warehouseManager": "John Doe",
    "contact": "9876543210",
    "location": { ... },
    "serviceablePincodes": ["400001", "400002"],
    "storageType": "ambient",
    "capacity": 5000,
    "currentStock": 3200,
    "isActive": true,
    "promotor": { "_id": "...", "name": "...", "email": "...", "phone": "..." },
    "sellers": [
      {
        "_id": "...",
        "name": "Alice",
        "email": "alice@example.com",
        "phone": "9000000001",
        "businessName": "Alice Foods",
        "approvalStatus": "approved",
        "isActive": true
      }
    ],
    "products": [
      { "_id": "...", "name": "...", "price": 99, "stockStatus": "in_stock", "images": [...] }
    ]
  },
  "products": [
    {
      "_id": "...",
      "name": "Basmati Rice 5kg",
      "price": 350,
      "stockStatus": "in_stock",
      "images": [...],
      "category": { "_id": "...", "name": "Grains" },
      "seller": { "_id": "...", "name": "Alice", "businessName": "Alice Foods" }
    }
  ]
}
```

> `products` in the response body is the full resolved list (from both the warehouse's `products` array and any product that has `warehouse.id` set to this warehouse).

#### Error Responses

| Status | Message               | Cause                          |
|--------|-----------------------|--------------------------------|
| `401`  | No token provided     | Missing Authorization header   |
| `401`  | Invalid or expired token | Bad or expired JWT            |
| `403`  | Warehouse is inactive | Warehouse deactivated          |

---

### 4. Get Products

Get paginated products belonging to this warehouse, with optional filters.

**`GET /api/warehouse/products`**

**Auth required:** Yes

#### Query Parameters

| Param         | Type   | Required | Default | Description                                          |
|---------------|--------|----------|---------|------------------------------------------------------|
| `page`        | number | No       | `1`     | Page number                                          |
| `limit`       | number | No       | `20`    | Results per page (max 100)                           |
| `search`      | string | No       | —       | Case-insensitive search on product name              |
| `stockStatus` | string | No       | —       | Filter by stock status (e.g. `in_stock`, `out_of_stock`) |
| `category`    | string | No       | —       | Filter by category ObjectId                          |

```
GET /api/warehouse/products?page=1&limit=10&search=rice&stockStatus=in_stock
```

#### Success Response `200`

```json
{
  "success": true,
  "products": [
    {
      "_id": "...",
      "name": "Basmati Rice 5kg",
      "price": 350,
      "stockStatus": "in_stock",
      "images": [...],
      "category": { "_id": "...", "name": "Grains" },
      "seller": { "_id": "...", "name": "Alice", "businessName": "Alice Foods" }
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "pages": 5
  }
}
```

#### Error Responses

| Status | Message              | Cause                          |
|--------|----------------------|--------------------------------|
| `400`  | Invalid category id  | `category` is not a valid ObjectId |
| `401`  | No token provided    | Missing Authorization header   |

---

### 5. Get Sellers

Get paginated sellers assigned to this warehouse.

**`GET /api/warehouse/sellers`**

**Auth required:** Yes

#### Query Parameters

| Param            | Type   | Required | Default | Description                                                  |
|------------------|--------|----------|---------|--------------------------------------------------------------|
| `page`           | number | No       | `1`     | Page number                                                  |
| `limit`          | number | No       | `20`    | Results per page (max 100)                                   |
| `search`         | string | No       | —       | Search on seller `name`, `businessName`, or `email`          |
| `approvalStatus` | string | No       | —       | Filter by approval status: `pending`, `approved`, `rejected` |

```
GET /api/warehouse/sellers?approvalStatus=approved&search=alice
```

#### Success Response `200`

```json
{
  "success": true,
  "sellers": [
    {
      "_id": "...",
      "name": "Alice",
      "email": "alice@example.com",
      "phone": "9000000001",
      "businessName": "Alice Foods",
      "approvalStatus": "approved",
      "isActive": true,
      "shop": {
        "_id": "...",
        "name": "Alice's Shop",
        "logo": "https://...",
        "isOpen": true,
        "isActive": true
      }
    }
  ],
  "pagination": {
    "total": 8,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

---

### 6. Get Orders

Get paginated orders for this warehouse's products — every field on the order is returned.

**`GET /api/warehouse/orders`**

**Auth required:** Yes

#### Query Parameters

| Param           | Type   | Required | Default | Description                                              |
|-----------------|--------|----------|---------|----------------------------------------------------------|
| `page`          | number | No       | `1`     | Page number                                              |
| `limit`         | number | No       | `20`    | Results per page (max 100)                               |
| `status`        | string | No       | —       | Order status: `pending`, `confirmed`, `picked-up`, `delivered`, `cancelled` |
| `paymentStatus` | string | No       | —       | `pending`, `paid`, `failed`, `refunded`                  |
| `paymentMethod` | string | No       | —       | `cod` or `online`                                        |
| `from`          | string | No       | —       | Start date filter — ISO 8601 (e.g. `2025-01-01`)         |
| `to`            | string | No       | —       | End date filter — ISO 8601 (e.g. `2025-01-31`)           |

```
GET /api/warehouse/orders?status=delivered&paymentMethod=cod&from=2025-01-01&to=2025-01-31
```

#### Success Response `200`

```json
{
  "success": true,
  "orders": [
    {
      "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "orderId": "FST042",
      "status": "delivered",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T14:45:00.000Z",

      "user": {
        "_id": "64e1a2b3c4d5e6f7a8b9c0d2",
        "name": "Ravi Kumar",
        "email": "ravi@example.com",
        "phone": "9876543210",
        "wallet": 50
      },

      "seller": {
        "_id": "64e1a2b3c4d5e6f7a8b9c0d3",
        "name": "Alice Sharma",
        "businessName": "Alice Foods Pvt Ltd",
        "email": "alice@alicefoods.com",
        "phone": "9000000001",
        "address": "12, MG Road, Bengaluru"
      },

      "driver": {
        "_id": "64e1a2b3c4d5e6f7a8b9c0d4",
        "personalInfo": {
          "name": "Mohan Das",
          "phone": "9111111111"
        },
        "workInfo": {
          "driverId": "DRV000012"
        }
      },
      "driverAssignedAt": "2025-01-15T12:00:00.000Z",
      "driverAssignedBy": "64e1a2b3c4d5e6f7a8b9c0d5",
      "driverAssignmentHistory": [
        {
          "driver": "64e1a2b3c4d5e6f7a8b9c0d4",
          "assignedBy": "64e1a2b3c4d5e6f7a8b9c0d5",
          "assignedAt": "2025-01-15T12:00:00.000Z",
          "action": "assigned"
        }
      ],

      "items": [
        {
          "_id": "64f1a2b3c4d5e6f7a8b9c0e1",
          "product": {
            "_id": "64e1a2b3c4d5e6f7a8b9c0d6",
            "name": "Basmati Rice 5kg",
            "brand": "India Gate",
            "description": "Premium long-grain basmati rice",
            "price": 350,
            "unit": "kg",
            "unitValue": "5",
            "stockStatus": "in_stock",
            "category": "64e1a2b3c4d5e6f7a8b9c0d7",
            "images": [
              { "url": "https://ik.imagekit.io/fast2/products/rice.jpg", "fileId": "abc123" }
            ]
          },
          "quantity": 2,
          "price": 350,
          "gstPercent": 5,
          "gstAmount": 35
        },
        {
          "_id": "64f1a2b3c4d5e6f7a8b9c0e2",
          "product": {
            "_id": "64e1a2b3c4d5e6f7a8b9c0d8",
            "name": "Toor Dal 1kg",
            "brand": "24 Mantra",
            "description": "Organic toor dal",
            "price": 120,
            "unit": "kg",
            "unitValue": "1",
            "stockStatus": "in_stock",
            "category": "64e1a2b3c4d5e6f7a8b9c0d7",
            "images": [
              { "url": "https://ik.imagekit.io/fast2/products/dal.jpg", "fileId": "def456" }
            ]
          },
          "quantity": 1,
          "price": 120,
          "gstPercent": 5,
          "gstAmount": 6
        }
      ],

      "subtotal": 820,
      "deliveryCharges": 0,
      "isFreeDelivery": true,
      "handlingCharge": 2,
      "total": 820,
      "totalGst": 41,
      "coupon": {
        "code": "SAVE10",
        "discount": 50
      },
      "scratchCouponDiscount": 0,
      "finalAmount": 772,
      "walletDeduction": 20,
      "cashOnDelivery": 752,

      "paymentMethod": "cod",
      "paymentStatus": "paid",
      "secretCode": "483920",
      "isSecretCodeVerified": true,
      "driverMarkedPaid": true,

      "shippingAddress": {
        "addressLine": "Flat 4B, Sunrise Apartments, Koramangala",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pinCode": "560034",
        "country": "India",
        "phone": "9876543210",
        "lat": 12.9352,
        "lng": 77.6245
      },

      "estimatedDelivery": "2025-01-15T18:00:00.000Z",
      "deliveryNotes": "Leave at the door",
      "trackingNumber": null,

      "cancelledAt": null,
      "cancellationReason": null,

      "refundAmount": 0,
      "refundStatus": "none",
      "refundedAt": null,

      "payout": {
        "seller": {
          "payableAmount": 694.8,
          "gstDeduction": 13.93,
          "tdsDeduction": 7.72,
          "netAmount": 687.08,
          "payoutStatus": "pending",
          "paidAt": null
        },
        "promotor": {
          "commissionAmount": 38.6,
          "commissionType": "percentage",
          "commissionRate": 5,
          "payoutStatus": "pending",
          "paidAt": null
        },
        "platform": {
          "serviceFee": 77.2,
          "gstCollection": 13.93
        }
      },

      "prescriptionImage": {
        "url": "",
        "fileId": ""
      },

      "orderScratchCard": {
        "isEligible": true,
        "couponCode": "SCRATCH50",
        "isScratched": false,
        "scratchedAt": null,
        "isRedeemed": false,
        "redeemedAt": null
      },

      "scratchGifts": [
        {
          "product": {
            "_id": "64e1a2b3c4d5e6f7a8b9c0d6",
            "name": "Basmati Rice 5kg",
            "images": [{ "url": "https://ik.imagekit.io/fast2/products/rice.jpg", "fileId": "abc123" }]
          },
          "coinsAmount": 10,
          "isScratched": false,
          "scratchedAt": null
        }
      ]
    }
  ],
  "pagination": {
    "total": 156,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

#### All Order Fields Reference

| Field | Type | Description |
|---|---|---|
| `orderId` | string | Auto-generated ID e.g. `FST001` |
| `status` | string | `pending` / `confirmed` / `picked-up` / `delivered` / `cancelled` |
| `user` | object | Customer — name, email, phone, wallet |
| `seller` | object | Seller — name, businessName, email, phone, address |
| `driver` | object / null | Assigned driver — name, phone, driverId |
| `driverAssignedAt` | date / null | When driver was assigned |
| `driverAssignmentHistory` | array | Full log of driver assign/unassign actions |
| `items` | array | Order line items (see below) |
| `subtotal` | number | Sum of `price × quantity` for all items |
| `deliveryCharges` | number | Total delivery fee |
| `isFreeDelivery` | boolean | Whether delivery was free |
| `handlingCharge` | number | `₹2 × number of sellers` |
| `total` | number | `subtotal + deliveryCharges` |
| `totalGst` | number | Total GST across all items |
| `coupon.code` | string | Applied coupon code |
| `coupon.discount` | number | Coupon discount amount |
| `scratchCouponDiscount` | number | Scratch card coupon discount |
| `finalAmount` | number | Amount after all discounts and charges |
| `walletDeduction` | number | Amount paid from wallet |
| `cashOnDelivery` | number | Remaining amount to collect at door |
| `paymentMethod` | string | `cod` or `online` |
| `paymentStatus` | string | `pending` / `paid` / `failed` / `refunded` |
| `secretCode` | string | 6-digit COD verification code |
| `isSecretCodeVerified` | boolean | Whether COD code was verified |
| `driverMarkedPaid` | boolean | Whether driver marked COD as collected |
| `shippingAddress` | object | Full delivery address with lat/lng |
| `estimatedDelivery` | date / null | Estimated delivery time |
| `deliveryNotes` | string / null | Customer delivery instructions |
| `trackingNumber` | string / null | Tracking reference |
| `cancelledAt` | date / null | Cancellation timestamp |
| `cancellationReason` | string / null | Reason for cancellation |
| `refundAmount` | number | Amount refunded |
| `refundStatus` | string | `none` / `pending` / `processed` / `failed` |
| `refundedAt` | date / null | Refund processed timestamp |
| `payout.seller` | object | Seller payout breakdown (payable, GST, TDS, net) |
| `payout.promotor` | object | Promotor commission details |
| `payout.platform` | object | Platform service fee and GST collected |
| `prescriptionImage` | object | Prescription image URL (medical orders) |
| `orderScratchCard` | object | Scratch card eligibility and redemption state |
| `scratchGifts` | array | Products that triggered scratch gifts |
| `createdAt` | date | Order creation timestamp |
| `updatedAt` | date | Last update timestamp |

#### Item Fields

| Field | Type | Description |
|---|---|---|
| `product._id` | string | Product ID |
| `product.name` | string | Product name |
| `product.brand` | string | Brand |
| `product.description` | string | Description |
| `product.price` | number | Current listed price |
| `product.unit` | string | Unit type (kg, litre, piece, etc.) |
| `product.unitValue` | string | Unit quantity (e.g. `5` for 5kg) |
| `product.stockStatus` | string | `in_stock` / `out_of_stock` / `low_stock` |
| `product.category` | string | Category ID |
| `product.images` | array | Array of `{ url, fileId }` |
| `quantity` | number | Ordered quantity |
| `price` | number | Price at time of order |
| `gstPercent` | number | GST % applied |
| `gstAmount` | number | GST amount for this line item |

#### Error Responses

| Status | Message           | Cause                             |
|--------|-------------------|-----------------------------------|
| `400`  | Invalid from date | `from` is not a valid date string |
| `400`  | Invalid to date   | `to` is not a valid date string   |

---

### 7. Get Analytics

Get aggregated analytics for the warehouse — overview stats, order breakdowns, and a 6-month revenue trend.

**`GET /api/warehouse/analytics`**

**Auth required:** Yes

#### Success Response `200`

```json
{
  "success": true,
  "analytics": {
    "overview": {
      "totalOrders": 312,
      "totalRevenue": 154800,
      "ordersThisMonth": 45,
      "revenueThisMonth": 22500,
      "ordersToday": 7,
      "revenueToday": 3400,
      "totalSellers": 10,
      "activeSellers": 8,
      "totalProducts": 94,
      "capacity": 5000,
      "currentStock": 3200,
      "utilizationPercent": 64
    },
    "ordersByStatus": [
      { "_id": "delivered", "count": 210 },
      { "_id": "pending", "count": 60 },
      { "_id": "cancelled", "count": 42 }
    ],
    "ordersByPaymentMethod": [
      { "_id": "cod", "count": 200 },
      { "_id": "online", "count": 112 }
    ],
    "monthlyTrend": [
      { "_id": { "year": 2024, "month": 8 }, "revenue": 18000, "orders": 38 },
      { "_id": { "year": 2024, "month": 9 }, "revenue": 21000, "orders": 44 },
      { "_id": { "year": 2024, "month": 10 }, "revenue": 25000, "orders": 52 },
      { "_id": { "year": 2024, "month": 11 }, "revenue": 22000, "orders": 46 },
      { "_id": { "year": 2024, "month": 12 }, "revenue": 27800, "orders": 58 },
      { "_id": { "year": 2025, "month": 1 }, "revenue": 22500, "orders": 45 }
    ]
  }
}
```

#### Field Descriptions

| Field                | Description                                                |
|----------------------|------------------------------------------------------------|
| `totalRevenue`       | Sum of `finalAmount` for all `paid` orders                 |
| `revenueThisMonth`   | Paid revenue since the 1st of the current month            |
| `revenueToday`       | Paid revenue since midnight today                          |
| `activeSellers`      | Sellers with `isActive: true` and `approvalStatus: approved` |
| `utilizationPercent` | `(currentStock / capacity) × 100`, rounded                 |
| `monthlyTrend`       | Last 6 months of paid order revenue and count              |

---

## Common Error Responses

These apply to all protected endpoints:

| Status | Message                 | Cause                              |
|--------|-------------------------|------------------------------------|
| `401`  | No token provided       | Missing or malformed Authorization header |
| `401`  | Invalid or expired token | JWT verification failed            |
| `403`  | Warehouse is inactive   | Warehouse has been deactivated     |
| `500`  | Server error            | Unexpected server-side error       |
