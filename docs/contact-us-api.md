# Contact Us API Documentation

## Base URL
```
/contact
```

---

## Public API

### Submit Contact Form
**POST** `/contact/submit`

Allows users to submit a contact form from the website.

**Request Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "subject": "Order Issue",
  "message": "I have an issue with my recent order."
}
```

**Validations**
- All fields are required
- `email` must be a valid email format
- `phone` must be a 10-digit number
- `subject` must be one of:
  - `General Inquiry`
  - `Product Support`
  - `Order Issue`
  - `Delivery Problem`
  - `Return/Refund`
  - `Partnership Inquiry`
  - `Feedback`
  - `Other`
- `message` must be between 10 and 5000 characters
- Duplicate submissions (same email + similar message within 1 hour) are blocked

**Success Response** `201`
```json
{
  "success": true,
  "message": "Your message has been received! We will get back to you soon.",
  "data": {
    "id": "664abc123def456789",
    "referenceNumber": "CONTACT-ABC123",
    "submittedAt": "2026-03-28T09:45:00.000Z"
  }
}
```

---

## Admin APIs

### 1. Get All Contacts
**GET** `/contact/admin/contacts`

Returns a paginated and filterable list of all contact submissions.

**Query Parameters**

| Parameter   | Type   | Default     | Description                                      |
|-------------|--------|-------------|--------------------------------------------------|
| `page`      | Number | `1`         | Page number                                      |
| `limit`     | Number | `20`        | Results per page                                 |
| `status`    | String | -           | `pending` / `contacted` / `resolved`             |
| `priority`  | String | -           | `low` / `medium` / `high`                        |
| `subject`   | String | -           | Filter by subject                                |
| `search`    | String | -           | Search across name, email, phone, subject, message |
| `startDate` | Date   | -           | Filter from this date (ISO format)               |
| `endDate`   | Date   | -           | Filter until this date (ISO format)              |
| `sortBy`    | String | `createdAt` | Field to sort by                                 |
| `sortOrder` | String | `desc`      | `asc` or `desc`                                  |

**Success Response** `200`
```json
{
  "success": true,
  "data": [ /* array of contact objects */ ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  },
  "filters": {
    "statuses": ["pending", "contacted", "resolved"],
    "priorities": ["low", "medium", "high"],
    "subjects": ["Order Issue", "Feedback"]
  }
}
```

---

### 2. Get Contact by ID
**GET** `/contact/admin/contacts/:id`

Returns a single contact submission by its ID.

**Success Response** `200`
```json
{
  "success": true,
  "data": {
    "_id": "664abc123def456789",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "subject": "Order Issue",
    "message": "I have an issue with my recent order.",
    "status": "pending",
    "priority": "high",
    "assignedTo": { "name": "Admin", "email": "admin@example.com", "role": "admin" },
    "response": null,
    "respondedAt": null,
    "tags": ["order-issue"],
    "source": "website",
    "createdAt": "2026-03-28T09:45:00.000Z"
  }
}
```

---

### 3. Update Contact Status
**PUT** `/contact/admin/contacts/:id`

Update the status, priority, assigned admin, tags, or add a response.

**Request Body**
```json
{
  "status": "resolved",
  "priority": "high",
  "assignedTo": "<adminUserId>",
  "tags": ["urgent", "refund"],
  "response": "We have processed your refund. It will reflect in 3-5 business days."
}
```

**Notes**
- Setting `status` to `resolved` also requires a `response` — it records `respondedAt` automatically
- Setting `assignedTo` without a `status` automatically sets status to `contacted`
- `tags` are merged (not replaced) with existing tags

**Success Response** `200`
```json
{
  "success": true,
  "message": "Contact submission updated successfully",
  "data": { /* updated contact object */ }
}
```

---

### 4. Delete Contact
**DELETE** `/contact/admin/contacts/:id`

Permanently deletes a contact submission.

**Success Response** `200`
```json
{
  "success": true,
  "message": "Contact submission deleted successfully"
}
```

---

### 5. Get Contact Stats
**GET** `/contact/admin/stats`

Returns analytics and statistics for all contact submissions.

**Success Response** `200`
```json
{
  "success": true,
  "data": {
    "counts": {
      "total": 150,
      "pending": 40,
      "contacted": 30,
      "resolved": 80,
      "unresolved": 70
    },
    "last7Days": [
      { "date": "2026-03-22", "count": 5, "highPriority": 2 }
    ],
    "bySubject": [
      { "subject": "Order Issue", "count": 50, "avgResponseTime": 3.5 }
    ],
    "priorityStats": [
      { "_id": "high", "count": 60, "unresolved": 20 }
    ],
    "responseTime": {
      "avgResponseHours": 4.2,
      "minResponseHours": 0.5,
      "maxResponseHours": 24.0
    },
    "recentActivity": [
      { "name": "John", "email": "john@example.com", "subject": "Order Issue", "status": "pending", "createdAt": "2026-03-28T09:45:00.000Z" }
    ]
  }
}
```

---

### 6. Export Contacts as CSV
**GET** `/contact/admin/export`

Downloads all contact submissions as a `.csv` file.

**Query Parameters**

| Parameter   | Type   | Description                          |
|-------------|--------|--------------------------------------|
| `startDate` | Date   | Filter from this date (ISO format)   |
| `endDate`   | Date   | Filter until this date (ISO format)  |
| `status`    | String | `pending` / `contacted` / `resolved` |

**Response**
- Content-Type: `text/csv`
- File: `contacts_export.csv`

**CSV Columns:** Name, Email, Phone, Subject, Message, Status, Priority, Submitted At, Responded At, Response

---

## Contact Schema

| Field         | Type     | Description                                      |
|---------------|----------|--------------------------------------------------|
| `name`        | String   | Full name (2–100 chars)                          |
| `email`       | String   | Valid email address                              |
| `phone`       | String   | 10-digit phone number                            |
| `subject`     | String   | One of the predefined subject enums              |
| `message`     | String   | Message body (10–5000 chars)                     |
| `status`      | String   | `pending` / `contacted` / `resolved`             |
| `priority`    | String   | `low` / `medium` / `high` (auto-set for urgent subjects) |
| `assignedTo`  | ObjectId | Reference to admin User                          |
| `response`    | String   | Admin's response message                         |
| `respondedAt` | Date     | Timestamp when response was sent                 |
| `tags`        | [String] | Labels/tags for categorization                   |
| `source`      | String   | `website` / `mobile-app` / `api`                 |
| `ipAddress`   | String   | Captured from request                            |
| `userAgent`   | String   | Captured from request headers                    |

---

## Auto-Priority Logic

Subjects marked as urgent are automatically assigned **high** priority on submission:
- `Order Issue`
- `Delivery Problem`
- `Return/Refund`
