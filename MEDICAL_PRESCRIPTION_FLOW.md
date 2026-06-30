# Medical Prescription Flow Implementation

## Goal

Implement complete medical shop prescription flow in the app.

Current frontend already has partial support:

- Detects `shopType === "medical"` in checkout
- Requires prescription image upload for medical shop orders
- Sends `prescriptionImage` to `/api/order/create`

Need to extend this into a proper medical product, prescription verification, and order tracking flow.

## Required Flow

```text
Customer adds medical product to cart
Customer goes to checkout
Checkout detects prescription requirement
Customer uploads prescription
Order is created as Pending Prescription Verification
Medical shop/admin reviews prescription
If approved, order moves to Confirmed / Packed / Out for Delivery / Delivered
If rejected, order moves to Prescription Rejected / Cancelled / Refund if paid
```

## Frontend Changes

### 1. Product-Level Prescription Flag

Add support for product-level prescription requirement.

Expected product fields:

```js
{
  isPrescriptionRequired: true,
  medicineDetails: {
    salt: "Paracetamol",
    dosage: "500mg",
    manufacturer: "ABC Pharma",
    expiryDate: "2027-05-01"
  }
}
```

Use this instead of only checking shop type.

Current logic:

```js
item.product?.shop?.shopType === "medical"
```

Better logic:

```js
const requiresPrescription = cartItems.some(item =>
  item.product?.isPrescriptionRequired ||
  item.product?.shop?.shopType === "medical"
);
```

### 2. Product Detail Page

File:

```text
src/app/product/[id]/page.jsx
```

Show medicine details if available:

```text
Salt / Composition
Dosage
Manufacturer
Expiry Date
Prescription Required badge
```

UI example:

```jsx
{product.isPrescriptionRequired && (
  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
    <p className="font-semibold text-amber-800">Prescription Required</p>
    <p className="text-sm text-amber-700">
      Doctor prescription is required to purchase this medicine.
    </p>
  </div>
)}
```

### 3. Cart Page

File:

```text
src/app/components/cart/page.jsx
```

Show prescription badge for prescription products:

```jsx
{product.isPrescriptionRequired && (
  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-md">
    Prescription Required
  </span>
)}
```

### 4. Checkout Page

File:

```text
src/app/checkout/page.jsx
```

Replace current medical-order check with:

```js
const requiresPrescription = () => {
  return cartItems.some(item =>
    item.product?.isPrescriptionRequired ||
    item.product?.shop?.shopType === "medical"
  );
};
```

Validation:

```js
if (requiresPrescription() && !prescriptionImage) {
  setError("Doctor prescription is required for this order");
  return;
}
```

FormData:

```js
if (prescriptionImage) {
  formData.append("prescriptionImage", prescriptionImage);
}
```

Also send a flag:

```js
formData.append("requiresPrescription", requiresPrescription());
```

### 5. Order Status Mapping

File:

```text
src/app/pages/orders/page.jsx
```

Add new statuses:

```js
case "pending-prescription":
  return {
    label: "Prescription Review",
    cls: "bg-amber-100 text-amber-700"
  };

case "prescription-approved":
  return {
    label: "Prescription Approved",
    cls: "bg-blue-100 text-blue-700"
  };

case "prescription-rejected":
  return {
    label: "Prescription Rejected",
    cls: "bg-red-100 text-red-600"
  };
```

Update tabs:

```js
{
  id: "pending-prescription",
  label: "Prescription Review",
  count: orders.filter(o => o.status === "pending-prescription").length,
  icon: ClockIcon
}
```

### 6. Order Detail Page

In order detail, show prescription status:

```jsx
{order.prescription && (
  <div className="bg-white rounded-xl border border-gray-100 p-4">
    <h3 className="font-bold text-gray-900 mb-2">Prescription</h3>

    <p className="text-sm text-gray-600">
      Status: {order.prescription.status}
    </p>

    {order.prescription.imageUrl && (
      <img
        src={order.prescription.imageUrl}
        alt="Prescription"
        className="mt-3 w-32 h-32 object-cover rounded-lg border"
      />
    )}

    {order.prescription.rejectionReason && (
      <p className="text-sm text-red-600 mt-2">
        Reason: {order.prescription.rejectionReason}
      </p>
    )}
  </div>
)}
```

## Backend Expected Order Fields

Order should return:

```js
{
  status: "pending-prescription",
  prescription: {
    imageUrl: "https://...",
    status: "pending",
    rejectionReason: "",
    reviewedAt: null,
    reviewedBy: null
  }
}
```

Prescription status values:

```text
pending
approved
rejected
```

## Admin / Seller Panel Changes

Medical shop owner/admin needs prescription review screen.

Required actions:

```text
View prescription
Approve prescription
Reject prescription with reason
```

API examples:

```http
GET /api/seller/orders/prescriptions
PATCH /api/seller/orders/:orderId/prescription/approve
PATCH /api/seller/orders/:orderId/prescription/reject
```

Reject payload:

```json
{
  "reason": "Prescription is unclear or invalid"
}
```

## Status Flow

### Non-Medical Order

```text
pending
confirmed
packed
picked-up
delivered
```

### Medical / Prescription Order

```text
pending-prescription
prescription-approved
confirmed
packed
picked-up
delivered
```

Rejected flow:

```text
pending-prescription
prescription-rejected
cancelled
```

## Important Rules

- Prescription should be required if product has `isPrescriptionRequired: true`
- Prescription should also be required if shop has `shopType: "medical"`
- Customer should not be able to place prescription order without upload
- Medical order should not move to delivery until prescription is approved
- If online payment is already done and prescription is rejected, refund flow should be triggered
- Order page should clearly show prescription review/rejection status

## Implementation Checklist

- [ ] Add `isPrescriptionRequired` support in product UI
- [ ] Show medicine details on product detail page
- [ ] Show prescription badge in cart
- [ ] Update checkout prescription detection
- [ ] Upload prescription with order create request
- [ ] Add prescription-specific order statuses
- [ ] Show prescription status in order detail
- [ ] Add seller/admin prescription review UI
- [ ] Add approve/reject APIs in backend
- [ ] Prevent dispatch before prescription approval
