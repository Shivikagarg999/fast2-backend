# Popup Notification APIs Documentation

**Base URL**: `https://api.fast2.in/api/popups`

This document provides detailed information about popup notification system for admin control and frontend display.

---

## Overview

The popup system allows administrators to create time-based notifications that appear on the website frontend. Popups can be scheduled to appear at specific times and can include images, custom positioning, and targeting options.

---

## Authentication

### Public Endpoint
- **GET /active** - No authentication required (for frontend display)

### Admin Endpoints
- **All other endpoints** - Require admin authentication
- **Auth Header**: `Authorization: Bearer <admin_jwt_token>`

---

## 1. Get Active Popup (Public)

### Endpoint
```
GET https://api.fast2.in/api/popups/active
```

### Description
Retrieve the currently active popup that should be displayed on the frontend. This endpoint checks the current time and returns only popups that are scheduled to be shown.

### Response
```json
{
  "success": true,
  "data": {
    "_id": "popup_id",
    "title": "Special Offer!",
    "message": "Get 20% off on all electronics today only!",
    "imageUrl": "https://cdn.fast2.in/popups/sale-banner.jpg",
    "type": "info",
    "position": "top-center",
    "showCloseButton": true,
    "autoCloseAfter": 10,
    "targetPages": [],
    "targetUsers": [],
    "priority": 1,
    "startTime": "2024-03-17T09:00:00.000Z",
    "endTime": "2024-03-17T10:12:00.000Z",
    "isActive": true,
    "createdAt": "2024-03-17T08:30:00.000Z",
    "updatedAt": "2024-03-17T08:30:00.000Z"
  }
}
```

### Response when no active popup
```json
{
  "success": true,
  "data": null
}
```

---

## 2. Create Popup (Admin Only)

### Endpoint
```
POST https://api.fast2.in/api/popups
```

### Authentication
Required: `Authorization: Bearer <admin_jwt_token>`

### Request Body
```json
{
  "title": "Flash Sale!",
  "message": "Limited time offer - Up to 50% off on selected items",
  "imageUrl": "https://example.com/popup-image.jpg",
  "startTime": "2024-03-17T09:00:00.000Z",
  "endTime": "2024-03-17T10:12:00.000Z",
  "isActive": true,
  "type": "success",
  "position": "top-center",
  "showCloseButton": true,
  "autoCloseAfter": 30,
  "targetPages": ["/home", "/products"],
  "targetUsers": ["premium", "new"],
  "priority": 2
}
```

### Request Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|-------------|
| title | String | Yes | - | Popup title (max 100 chars) |
| message | String | Yes | - | Popup message (max 500 chars) |
| imageUrl | String | No | null | URL to popup image |
| startTime | String | Yes | - | Start time in ISO format |
| endTime | String | Yes | - | End time in ISO format |
| isActive | Boolean | No | true | Whether popup is active |
| type | String | No | "info" | Popup type: "info", "warning", "success", "error" |
| position | String | No | "top-center" | Position: "top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right" |
| showCloseButton | Boolean | No | true | Show close button |
| autoCloseAfter | Number | No | null | Auto-close after X seconds (1-300, null for manual only) |
| targetPages | Array | No | [] | Pages to show on (empty = all pages) |
| targetUsers | Array | No | [] | User segments to target (empty = all users) |
| priority | Number | No | 1 | Priority (1-10, higher shows first) |

### Response
```json
{
  "success": true,
  "message": "Popup created successfully",
  "data": {
    "_id": "popup_id",
    "title": "Flash Sale!",
    "message": "Limited time offer - Up to 50% off on selected items",
    "imageUrl": "https://example.com/popup-image.jpg",
    "startTime": "2024-03-17T09:00:00.000Z",
    "endTime": "2024-03-17T10:12:00.000Z",
    "isActive": true,
    "type": "success",
    "position": "top-center",
    "showCloseButton": true,
    "autoCloseAfter": 30,
    "targetPages": ["/home", "/products"],
    "targetUsers": ["premium", "new"],
    "priority": 2,
    "createdBy": "admin_id",
    "createdAt": "2024-03-17T08:30:00.000Z"
  }
}
```

---

## 3. Get All Popups (Admin Only)

### Endpoint
```
GET https://api.fast2.in/api/popups
```

### Authentication
Required: `Authorization: Bearer <admin_jwt_token>`

### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | Number | 1 | Page number for pagination |
| limit | Number | 10 | Popups per page (max: 50) |
| isActive | Boolean | - | Filter by active status |
| type | String | - | Filter by popup type |

### Example Requests
```javascript
// Get first page of all popups
GET https://api.fast2.in/api/popups

// Get only active popups
GET https://api.fast2.in/api/popups?isActive=true

// Get only info type popups
GET https://api.fast2.in/api/popups?type=info

// Get page 2 with 20 items
GET https://api.fast2.in/api/popups?page=2&limit=20
```

### Response
```json
{
  "success": true,
  "data": [
    {
      "_id": "popup_id",
      "title": "Flash Sale!",
      "message": "Limited time offer",
      "type": "success",
      "position": "top-center",
      "isActive": true,
      "startTime": "2024-03-17T09:00:00.000Z",
      "endTime": "2024-03-17T10:12:00.000Z",
      "priority": 2,
      "createdAt": "2024-03-17T08:30:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalPopups": 25,
    "hasNext": true,
    "hasPrev": false,
    "limit": 10
  }
}
```

---

## 4. Update Popup (Admin Only)

### Endpoint
```
PUT https://api.fast2.in/api/popups/{popupId}
```

### Authentication
Required: `Authorization: Bearer <admin_jwt_token>`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| popupId | String | Popup ID (MongoDB ObjectId) |

### Request Body
Same as Create Popup - only include fields you want to update.

### Example Request
```json
{
  "title": "Updated Flash Sale!",
  "endTime": "2024-03-17T11:00:00.000Z",
  "isActive": false
}
```

### Response
```json
{
  "success": true,
  "message": "Popup updated successfully",
  "data": {
    "_id": "popup_id",
    "title": "Updated Flash Sale!",
    "message": "Limited time offer",
    "startTime": "2024-03-17T09:00:00.000Z",
    "endTime": "2024-03-17T11:00:00.000Z",
    "isActive": false,
    "updatedBy": "admin_id",
    "updatedAt": "2024-03-17T09:15:00.000Z"
  }
}
```

---

## 5. Delete Popup (Admin Only)

### Endpoint
```
DELETE https://api.fast2.in/api/popups/{popupId}
```

### Authentication
Required: `Authorization: Bearer <admin_jwt_token>`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| popupId | String | Popup ID (MongoDB ObjectId) |

### Response
```json
{
  "success": true,
  "message": "Popup deleted successfully"
}
```

---

## 6. Toggle Popup Status (Admin Only)

### Endpoint
```
PATCH https://api.fast2.in/api/popups/{popupId}/toggle
```

### Authentication
Required: `Authorization: Bearer <admin_jwt_token>`

### Path Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| popupId | String | Popup ID (MongoDB ObjectId) |

### Response
```json
{
  "success": true,
  "message": "Popup deactivated successfully",
  "data": {
    "_id": "popup_id",
    "isActive": false,
    "updatedAt": "2024-03-17T09:20:00.000Z"
  }
}
```

---

## Frontend Integration Guide

### 1. Displaying Active Popup

```javascript
// Fetch active popup on page load
const fetchActivePopup = async () => {
  try {
    const response = await fetch('https://api.fast2.in/api/popups/active');
    const result = await response.json();
    
    if (result.success && result.data) {
      showPopup(result.data);
    }
  } catch (error) {
    console.error('Error fetching popup:', error);
  }
};

// Show popup function
const showPopup = (popup) => {
  const popupContainer = document.createElement('div');
  popupContainer.className = `popup popup-${popup.type}`;
  popupContainer.style.position = 'fixed';
  
  // Set position based on popup.position
  const positions = {
    'top-left': { top: '20px', left: '20px' },
    'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)' },
    'bottom-right': { bottom: '20px', right: '20px' }
  };
  
  const pos = positions[popup.position] || positions['top-center'];
  Object.assign(popupContainer.style, pos);
  
  popupContainer.innerHTML = `
    <div class="popup-content">
      ${popup.imageUrl ? `<img src="${popup.imageUrl}" alt="${popup.title}" class="popup-image">` : ''}
      <div class="popup-text">
        <h3>${popup.title}</h3>
        <p>${popup.message}</p>
      </div>
      ${popup.showCloseButton ? '<button class="popup-close" onclick="closePopup()">×</button>' : ''}
    </div>
  `;
  
  document.body.appendChild(popupContainer);
  
  // Auto-close if specified
  if (popup.autoCloseAfter) {
    setTimeout(() => closePopup(), popup.autoCloseAfter * 1000);
  }
};

const closePopup = () => {
  const popup = document.querySelector('.popup');
  if (popup) {
    popup.remove();
  }
};

// Call on page load
fetchActivePopup();

// Optional: Check for new popups every minute
setInterval(fetchActivePopup, 60000);
```

### 2. CSS Styles

```css
.popup {
  z-index: 9999;
  max-width: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  animation: popupSlideIn 0.3s ease-out;
}

.popup-content {
  padding: 20px;
  position: relative;
}

.popup-image {
  width: 100%;
  height: auto;
  border-radius: 4px;
  margin-bottom: 15px;
}

.popup-text h3 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 18px;
}

.popup-text p {
  margin: 0 0 15px 0;
  color: #666;
  line-height: 1.5;
}

.popup-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.popup-close:hover {
  background: #d32f2f;
}

/* Type-based styling */
.popup-info .popup-text h3 { color: #2196F3; }
.popup-success .popup-text h3 { color: #28a745; }
.popup-warning .popup-text h3 { color: #ffc107; }
.popup-error .popup-text h3 { color: #dc3545; }

@keyframes popupSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 3. React Component Example

```jsx
import React, { useState, useEffect } from 'react';

const PopupManager = () => {
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    const fetchPopup = async () => {
      try {
        const response = await fetch('https://api.fast2.in/api/popups/active');
        const result = await response.json();
        
        if (result.success && result.data) {
          setPopup(result.data);
        }
      } catch (error) {
        console.error('Error fetching popup:', error);
      }
    };

    fetchPopup();
    const interval = setInterval(fetchPopup, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);

  const closePopup = () => {
    setPopup(null);
  };

  const getPopupStyle = () => {
    const positions = {
      'top-left': { top: 20, left: 20 },
      'top-center': { top: 20, left: '50%', transform: 'translateX(-50%)' },
      'top-right': { top: 20, right: 20 },
      'bottom-left': { bottom: 20, left: 20 },
      'bottom-center': { bottom: 20, left: '50%', transform: 'translateX(-50%)' },
      'bottom-right': { bottom: 20, right: 20 }
    };
    
    return positions[popup?.position] || positions['top-center'];
  };

  useEffect(() => {
    if (popup?.autoCloseAfter) {
      const timer = setTimeout(() => {
        closePopup();
      }, popup.autoCloseAfter * 1000);
      
      return () => clearTimeout(timer);
    }
  }, [popup]);

  if (!popup) return null;

  return (
    <div className={`popup popup-${popup.type}`} style={getPopupStyle()}>
      <div className="popup-content">
        {popup.imageUrl && (
          <img src={popup.imageUrl} alt={popup.title} className="popup-image" />
        )}
        <div className="popup-text">
          <h3>{popup.title}</h3>
          <p>{popup.message}</p>
        </div>
        {popup.showCloseButton && (
          <button className="popup-close" onClick={closePopup}>
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default PopupManager;
```

---

## Use Cases

### 1. Time-Limited Offers
```json
{
  "title": "Flash Sale - 9AM to 10:12AM",
  "message": "Get 50% off on all electronics!",
  "startTime": "2024-03-17T09:00:00.000Z",
  "endTime": "2024-03-17T10:12:00.000Z",
  "type": "success",
  "imageUrl": "https://cdn.fast2.in/flash-sale.jpg"
}
```

### 2. Maintenance Notices
```json
{
  "title": "Scheduled Maintenance",
  "message": "We'll be performing maintenance from 2AM to 4AM. Some features may be unavailable.",
  "startTime": "2024-03-18T02:00:00.000Z",
  "endTime": "2024-03-18T04:00:00.000Z",
  "type": "warning"
}
```

### 3. Feature Announcements
```json
{
  "title": "New Feature Launch!",
  "message": "Check out our new product recommendation engine. Now available for all users!",
  "startTime": "2024-03-17T00:00:00.000Z",
  "endTime": "2024-03-24T23:59:59.000Z",
  "type": "info",
  "autoCloseAfter": 15
}
```

---

## Error Responses

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

### Common Error Codes
- `400` - Bad request (validation error, invalid time format)
- `401` - Unauthorized (missing or invalid admin token)
- `403` - Forbidden (admin account deactivated)
- `404` - Not found (popup not found)
- `500` - Internal server error

---

## Rate Limits
- **Public endpoint**: 100 requests per minute per IP
- **Admin endpoints**: 200 requests per minute per admin

---

## Support
For any integration issues or questions, contact the backend development team.
