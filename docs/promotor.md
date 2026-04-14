# Promotor APIs

Promotor accounts are created by the admin. Once created, a promotor logs in and can view their sellers, products, orders, and dashboard stats.

---

## Authentication

All protected routes require a Bearer token obtained from the login endpoint.

```
Authorization: Bearer <token>
```

---

## Endpoints

| Method | Endpoint                    | Auth     | Description                        |
|--------|-----------------------------|----------|------------------------------------|
| POST   | `/api/promotor/login`       | Public   | Login with email & password        |
| GET    | `/api/promotor/profile`     | Required | Get own profile                    |
| GET    | `/api/promotor/dashboard`   | Required | Summary stats                      |
| GET    | `/api/promotor/sellers`     | Required | List sellers onboarded by promotor |
| GET    | `/api/promotor/products`    | Required | List products from their sellers   |
| GET    | `/api/promotor/orders`      | Required | List orders from their sellers     |

---

## 1. Login

```
POST /api/promotor/login
```

### Request Body

```json
{
  "email": "promotor@example.com",
  "password": "yourpassword"
}
```

### Response — 200

```json
{
  "success": true,
  "message": "Login successful",
  "token": "<JWT token>",
  "promotor": {
    "id": "664abc123...",
    "name": "Arjun Sharma",
    "email": "promotor@example.com",
    "phone": "9876543210",
    "city": "Bangalore",
    "commissionRate": 5,
    "commissionType": "percentage",
    "totalCommissionEarned": 12000,
    "totalProductsAdded": 45
  }
}
```

### Error Responses

| Status | Message                                          |
|--------|--------------------------------------------------|
| 400    | `Email and password are required`                |
| 401    | `Invalid email or password`                      |
| 403    | `Your account is inactive. Please contact support.` |
| 500    | `Server error`                                   |

---

## 2. Get Profile

```
GET /api/promotor/profile
```

Returns the logged-in promotor's full profile (password excluded).

### Response — 200

```json
{
  "success": true,
  "promotor": {
    "_id": "664abc123...",
    "name": "Arjun Sharma",
    "email": "promotor@example.com",
    "phone": "9876543210",
    "address": {
      "street": "12 Brigade Road",
      "city": "Bangalore",
      "state": "Karnataka",
      "pincode": "560001"
    },
    "commissionRate": 5,
    "commissionType": "percentage",
    "totalCommissionEarned": 12000,
    "totalProductsAdded": 45,
    "aadharNumber": "XXXX XXXX 1234",
    "panNumber": "AAAAA0000A",
    "bankDetails": {
      "accountNumber": "XXXX1234",
      "ifscCode": "SBIN0001234",
      "bankName": "State Bank of India",
      "branch": "Brigade Road"
    },
    "active": true
  }
}
```

---

## 3. Dashboard

```
GET /api/promotor/dashboard
```

Returns a summary of the promotor's activity and commission.

### Response — 200

```json
{
  "success": true,
  "dashboard": {
    "sellers": {
      "total": 12,
      "approved": 9,
      "pending": 3
    },
    "products": {
      "total": 87
    },
    "orders": {
      "total": 340,
      "delivered": 295
    },
    "commission": {
      "rate": 5,
      "type": "percentage",
      "totalEarned": 12000
    }
  }
}
```

---

## 4. My Sellers

```
GET /api/promotor/sellers
```

Returns all sellers onboarded by this promotor.

### Query Parameters

| Param    | Type   | Default | Description                                      |
|----------|--------|---------|--------------------------------------------------|
| `status` | string | —       | Filter by approval status: `approved`, `pending`, `rejected` |
| `page`   | number | 1       | Page number                                      |
| `limit`  | number | 20      | Results per page                                 |

### Example

```
GET /api/promotor/sellers?status=approved&page=1&limit=10
```

### Response — 200

```json
{
  "success": true,
  "total": 9,
  "page": 1,
  "pages": 1,
  "sellers": [
    {
      "_id": "665xyz...",
      "name": "Rajesh Kumar",
      "email": "rajesh@example.com",
      "phone": "9123456789",
      "businessName": "Rajesh Stores",
      "approvalStatus": "approved",
      "isActive": true,
      "totalOrders": 34,
      "totalEarnings": 45000,
      "shop": { "_id": "...", "name": "Rajesh Fresh Store" },
      "createdAt": "2024-11-01T10:00:00.000Z"
    }
  ]
}
```

---

## 5. Products

```
GET /api/promotor/products
```

Returns all products listed by this promotor's sellers.

### Query Parameters

| Param      | Type   | Default | Description                      |
|------------|--------|---------|----------------------------------|
| `sellerId` | string | —       | Filter products by a specific seller |
| `page`     | number | 1       | Page number                      |
| `limit`    | number | 20      | Results per page                 |

### Example

```
GET /api/promotor/products?sellerId=665xyz&page=1&limit=20
```

### Response — 200

```json
{
  "success": true,
  "total": 87,
  "page": 1,
  "pages": 5,
  "products": [
    {
      "_id": "667abc...",
      "name": "Organic Basmati Rice 5kg",
      "price": 499,
      "stockStatus": "in-stock",
      "quantity": 200,
      "isActive": true,
      "promotor": {
        "commissionRate": 5,
        "commissionType": "percentage",
        "commissionAmount": 24.95
      },
      "seller": {
        "_id": "665xyz...",
        "businessName": "Rajesh Stores"
      },
      "category": {
        "_id": "...",
        "name": "Groceries"
      },
      "images": [{ "url": "https://...", "isPrimary": true }],
      "createdAt": "2024-11-05T08:00:00.000Z"
    }
  ]
}
```

---

## 6. Orders

```
GET /api/promotor/orders
```

Returns all orders that contain products from this promotor's sellers.

### Query Parameters

| Param      | Type   | Default | Description                                                        |
|------------|--------|---------|--------------------------------------------------------------------|
| `status`   | string | —       | Filter by order status: `pending`, `confirmed`, `shipped`, `delivered`, `cancelled` |
| `sellerId` | string | —       | Filter orders for a specific seller                                |
| `page`     | number | 1       | Page number                                                        |
| `limit`    | number | 20      | Results per page                                                   |

### Example

```
GET /api/promotor/orders?status=delivered&page=1&limit=20
```

### Response — 200

```json
{
  "success": true,
  "total": 295,
  "page": 1,
  "pages": 15,
  "orders": [
    {
      "_id": "668abc...",
      "orderId": "ORD20241105001",
      "status": "delivered",
      "paymentMethod": "cod",
      "paymentStatus": "paid",
      "finalAmount": 998,
      "user": {
        "_id": "...",
        "name": "Sneha Patel",
        "phone": "9000012345"
      },
      "items": [
        {
          "quantity": 2,
          "price": 499,
          "product": {
            "_id": "667abc...",
            "name": "Organic Basmati Rice 5kg",
            "seller": "665xyz..."
          }
        }
      ],
      "shippingAddress": {
        "addressLine": "45 Park Street",
        "city": "Bangalore",
        "pinCode": "560001"
      },
      "createdAt": "2024-11-05T14:30:00.000Z"
    }
  ]
}
```

---

## Common Error Responses

| Status | Message                                            |
|--------|----------------------------------------------------|
| 401    | `No token provided`                                |
| 401    | `Invalid or expired token`                         |
| 403    | `Your account is inactive. Please contact support.` |
| 404    | `Promotor not found`                               |
| 500    | `Server error`                                     |

---

## Notes

- Promotor accounts are **created by the admin** via `POST /api/admin/promotor`. There is no self-signup.
- Every seller must be linked to a promotor at registration — this is a required field.
- Products and orders are fetched indirectly: products belong to sellers, orders contain those products.
