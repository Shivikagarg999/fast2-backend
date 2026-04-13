# Delete Account API

Allows an authenticated user to permanently delete their account. Requires password confirmation before deletion.

---

## Endpoint

```
DELETE /api/user/delete-account
```

---

## Headers

| Key             | Value                  | Required |
|-----------------|------------------------|----------|
| Authorization   | `Bearer <JWT token>`   | Yes      |
| Content-Type    | `application/json`     | Yes      |

---

## Request Body

```json
{
  "password": "user_current_password"
}
```

| Field    | Type   | Required | Description                        |
|----------|--------|----------|------------------------------------|
| password | string | Yes      | The user's current account password |

---

## Responses

### 200 — Success

```json
{
  "message": "Account deleted successfully"
}
```

### 400 — Missing password

```json
{
  "error": "Password is required to delete your account"
}
```

### 401 — Wrong password

```json
{
  "error": "Incorrect password"
}
```

### 401 — Missing or invalid token

```json
{
  "error": "No token, access denied"
}
```

### 404 — User not found

```json
{
  "error": "User not found"
}
```

### 500 — Server error

```json
{
  "error": "<error message>"
}
```

---

## Example — cURL

```bash
curl -X DELETE https://api.fast2.in/api/user/delete-account \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"password": "mypassword123"}'
```

## Example — JavaScript (fetch)

```js
const res = await fetch('https://api.fast2.in/api/user/delete-account', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ password: 'mypassword123' }),
});

const data = await res.json();
console.log(data.message);
```

---

## Notes

- The user must be logged in (valid JWT required).
- Password confirmation prevents accidental or unauthorized deletion.
- Deletion is permanent and cannot be undone.
