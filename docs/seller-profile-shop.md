# Seller Profile & Shop APIs

---

## 1. Update Seller Profile

Update personal and business details like email, phone, bank details, FSSAI, etc.

### Endpoint

```
PATCH /api/seller/profile
```

### Headers

| Key           | Value                | Required |
|---------------|----------------------|----------|
| Authorization | `Bearer <JWT token>` | Yes      |
| Content-Type  | `application/json`   | Yes      |

### Request Body

Send only the fields you want to update — everything else stays untouched.

```json
{
  "name": "Rajesh Kumar",
  "email": "rajesh@example.com",
  "phone": "9876543210",
  "businessName": "Rajesh Stores",
  "gstNumber": "22AAAAA0000A1Z5",
  "panNumber": "AAAAA0000A",
  "fssaiNumber": "12345678901234",
  "address": {
    "street": "123 MG Road",
    "city": "Bangalore",
    "state": "Karnataka",
    "pincode": "560001"
  },
  "bankDetails": {
    "accountHolder": "Rajesh Kumar",
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0001234",
    "bankName": "State Bank of India"
  }
}
```

### Editable Fields

| Field          | Type   | Description                                      |
|----------------|--------|--------------------------------------------------|
| `name`         | string | Seller's full name                               |
| `email`        | string | Login email — checked for conflicts              |
| `phone`        | string | Phone number — checked for conflicts             |
| `businessName` | string | Business / shop name                             |
| `gstNumber`    | string | GST registration number                          |
| `panNumber`    | string | PAN card number                                  |
| `fssaiNumber`  | string | FSSAI food license number                        |
| `address`      | object | Full address object                              |
| `bankDetails`  | object | Bank account details for payouts                 |

### Responses

**200 — Success**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "seller": {
    "_id": "...",
    "name": "Rajesh Kumar",
    "email": "rajesh@example.com",
    "phone": "9876543210",
    "businessName": "Rajesh Stores",
    "fssaiNumber": "12345678901234",
    "bankDetails": { ... },
    "approvalStatus": "approved"
  }
}
```

**400 — No fields provided**
```json
{
  "success": false,
  "message": "No valid fields provided"
}
```

**400 — Email or phone conflict**
```json
{
  "success": false,
  "message": "Email or phone already in use by another seller"
}
```

**401 — Unauthorized**
```json
{
  "success": false,
  "message": "No token provided"
}
```

---

## 2. Update Shop Details

Update shop name, description, contact info, address, timings, policies, social links, and media.

### Endpoint

```
PUT /api/seller/shop/
```

### Headers

| Key           | Value                    | Required |
|---------------|--------------------------|----------|
| Authorization | `Bearer <JWT token>`     | Yes      |
| Content-Type  | `multipart/form-data`    | Yes      |

> Use `multipart/form-data` even if you're not uploading files, since object fields like `timings` and `address` must be sent as JSON strings.

### Request Fields

| Field            | Type        | Description                                          |
|------------------|-------------|------------------------------------------------------|
| `shopName`       | string      | Shop display name (auto-regenerates URL slug)        |
| `description`    | string      | Full shop description                                |
| `tagline`        | string      | Short tagline shown on shop page                     |
| `contactEmail`   | string      | Public contact email                                 |
| `contactPhone`   | string      | Public contact phone                                 |
| `address`        | JSON string | Shop address object                                  |
| `shopType`       | string      | `general` or `medical`                               |
| `isOpen`         | boolean     | Manual open/close override                           |
| `timings`        | JSON string | Per-day open/close times                             |
| `returnPolicy`   | JSON string | Return policy details                                |
| `shippingPolicy` | JSON string | Shipping policy details                              |
| `socialLinks`    | JSON string | Instagram, Facebook, website links                   |
| `logo`           | file        | Shop logo image                                      |
| `coverImage`     | file        | Cover / banner image                                 |
| `video`          | file        | Promo video                                          |

### Object Field Formats

**`address`**
```json
{
  "street": "123 MG Road",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560001",
  "coordinates": { "lat": 12.9716, "lng": 77.5946 }
}
```

**`timings`**
```json
{
  "monday":    { "open": "09:00", "close": "21:00", "closed": false },
  "tuesday":   { "open": "09:00", "close": "21:00", "closed": false },
  "wednesday": { "open": "09:00", "close": "21:00", "closed": false },
  "thursday":  { "open": "09:00", "close": "21:00", "closed": false },
  "friday":    { "open": "09:00", "close": "21:00", "closed": false },
  "saturday":  { "open": "10:00", "close": "18:00", "closed": false },
  "sunday":    { "open": "00:00", "close": "00:00", "closed": true  },
  "timezone":  "Asia/Kolkata"
}
```

**`returnPolicy`**
```json
{
  "isReturnable": true,
  "returnWindowDays": 7,
  "description": "Items can be returned within 7 days of delivery."
}
```

**`shippingPolicy`**
```json
{
  "freeShippingAbove": 499,
  "estimatedDeliveryDays": 3,
  "description": "Free delivery on orders above ₹499."
}
```

**`socialLinks`**
```json
{
  "instagram": "https://instagram.com/myshop",
  "facebook": "https://facebook.com/myshop",
  "website": "https://myshop.com"
}
```

### Response

**200 — Success**
```json
{
  "success": true,
  "message": "Shop updated successfully",
  "data": {
    "_id": "...",
    "shopName": "Rajesh Fresh Store",
    "shopSlug": "rajesh-fresh-store",
    "description": "...",
    "timings": { ... },
    "logo": { "url": "https://..." },
    "coverImage": { "url": "https://..." }
  }
}
```

**404 — Shop not found**
```json
{
  "success": false,
  "message": "Shop not found"
}
```

---

## 3. Toggle Shop Open / Close

Quickly mark the shop as open or closed (vacation mode) without editing timings.

### Endpoint

```
PATCH /api/seller/shop/toggle-status
```

### Headers

| Key           | Value                | Required |
|---------------|----------------------|----------|
| Authorization | `Bearer <JWT token>` | Yes      |

### Response

```json
{
  "success": true,
  "message": "Shop is now closed",
  "isOpen": false
}
```

---

## Example — Update shop name and timings (JavaScript)

```js
const formData = new FormData();
formData.append('shopName', 'Rajesh Fresh Store');
formData.append('timings', JSON.stringify({
  monday:    { open: '09:00', close: '21:00', closed: false },
  tuesday:   { open: '09:00', close: '21:00', closed: false },
  wednesday: { open: '09:00', close: '21:00', closed: false },
  thursday:  { open: '09:00', close: '21:00', closed: false },
  friday:    { open: '09:00', close: '21:00', closed: false },
  saturday:  { open: '10:00', close: '18:00', closed: false },
  sunday:    { open: '00:00', close: '00:00', closed: true  },
  timezone:  'Asia/Kolkata'
}));

const res = await fetch('https://api.fast2.in/api/seller/shop/', {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});

const data = await res.json();
console.log(data.message);
```
