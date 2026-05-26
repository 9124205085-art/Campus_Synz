# API Documentation & Testing Guide

Base URL: `http://localhost:5000/api`

## Authentication Flow

1. `POST /auth/login` with username and password
2. Store `access_token` from response
3. Send `Authorization: Bearer <token>` on protected requests
4. Call `GET /auth/me` to verify session
5. On logout, discard token client-side (`POST /auth/logout`)

---

## Health Check

```http
GET /health
```

**Response (200):**
```json
{
  "status": "ok",
  "message": "College Management System API is running."
}
```

---

## Login

```http
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "Admin@123"
}
```

**Success (200):**
```json
{
  "message": "Login successful.",
  "access_token": "<jwt>",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@kcgcollege.edu",
    "role": "admin",
    "full_name": "System Administrator",
    "department": "Administration"
  }
}
```

**Failure (401):**
```json
{ "message": "Invalid username or password." }
```

---

## Current User Profile

```http
GET /auth/me
Authorization: Bearer <token>
```

---

## Dashboard Endpoints (Role-Protected)

### Admin only
```http
GET /dashboard/admin
Authorization: Bearer <admin_token>
```

### HOD only
```http
GET /dashboard/hod
Authorization: Bearer <hod_token>
```

### Faculty only
```http
GET /dashboard/faculty
Authorization: Bearer <faculty_token>
```

**403 Example** (wrong role):
```json
{ "message": "Access denied. Insufficient permissions." }
```

---

## Manual Testing with curl

```bash
# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"Admin@123\"}"

# Use token (replace TOKEN)
curl http://localhost:5000/api/dashboard/admin \
  -H "Authorization: Bearer TOKEN"

# Test role restriction (faculty token on admin route should return 403)
```

---

## Frontend Role-Based Routes

| Role | Dashboard URL |
|------|----------------|
| admin | `/admin/dashboard` |
| hod | `/hod/dashboard` |
| faculty | `/faculty/dashboard` |

Protected by `ProtectedRoute` component and backend `@role_required` decorator.
