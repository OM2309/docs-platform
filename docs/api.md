# API Documentation

## Overview

DocFlow exposes a versioned REST API under `/api/v1`. All responses are JSON.
The API is split into three groups:

| Group | Prefix | Auth |
|-------|--------|------|
| Auth | `/api/v1/auth` | Public |
| Public docs | `/api/v1/public` | Public |
| Admin (management) | `/api/v1/admin` | JWT Bearer required |

**Base URL (dev):** `http://localhost:8080`  
**Proxy URL (via Next.js):** `/api/v1/*` → rewrites to backend (no CORS needed)

---

## Authentication Approach

DocFlow uses a **dual-token JWT strategy**:

```
┌─────────────────────────────────────────────────────────────┐
│  Access Token  (JWT, 15 minutes)                            │
│  - Signed with HS256 + JWT_SECRET                          │
│  - Stateless — verified without DB lookup                   │
│  - Sent as: Authorization: Bearer <token>                   │
│                                                              │
│  Refresh Token  (opaque UUID, 7 days)                       │
│  - Stored in refresh_tokens table                           │
│  - Rotated on every use (old deleted, new issued)           │
│  - Enables server-side revocation (logout = DELETE all)     │
└─────────────────────────────────────────────────────────────┘
```

**Why this approach?**
- Access tokens are short-lived → stolen token has a small blast radius
- Refresh tokens are DB-backed → logout actually invalidates all sessions
- Token rotation → replay attacks have a near-zero window

**Error format (all endpoints):**
```json
{
  "error": "human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": "optional extra context"
}
```

---

## Auth Endpoints

### POST `/api/v1/auth/register`

Register a new admin/editor user.

**Request body:**
```json
{
  "email": "admin@example.com",
  "name": "Admin User",
  "password": "min8characters",
  "role": "admin"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | ✅ | Must be valid email, unique |
| `name` | string | ✅ | Min 2 characters |
| `password` | string | ✅ | Min 8 characters, bcrypt hashed |
| `role` | string | — | `admin` or `editor` (default: `editor`) |

**Response `201 Created`:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "550e8400-e29b-41d4-a716-446655440000",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
}
```

**Error codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Missing/invalid fields |
| 409 | `EMAIL_TAKEN` | Email already registered |
| 500 | `INTERNAL_ERROR` | Server error |

---

### POST `/api/v1/auth/login`

Authenticate and receive token pair.

**Request body:**
```json
{
  "email": "admin@example.com",
  "password": "yourpassword"
}
```

**Response `200 OK`:** Same shape as `/register`.

**Error codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Missing fields |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |

---

### POST `/api/v1/auth/refresh`

Exchange a refresh token for a new access + refresh pair. Old refresh token is deleted (rotation).

**Request body:**
```json
{
  "refresh_token": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response `200 OK`:** Same shape as `/register` with new tokens.

**Error codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 401 | `REFRESH_INVALID` | Token not found or expired |

---

### POST `/api/v1/auth/logout`

**Auth required.** Deletes all refresh tokens for the authenticated user (all sessions revoked).

**Response `200 OK`:**
```json
{ "message": "logged out successfully" }
```

---

### GET `/api/v1/auth/me`

**Auth required.** Returns the currently authenticated user's profile.

**Response `200 OK`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@example.com",
  "name": "Admin User",
  "role": "admin",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

---

## Public Endpoints

> No authentication required. All queries are filtered to `status = 'published'` at the database level — drafts are never exposed.

---

### GET `/api/v1/public/docs`

List all published documents (metadata only — no `content` field to keep payload small).

**Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Getting Started",
      "slug": "getting-started",
      "description": "Introduction to DocFlow",
      "tags": ["guide", "intro"],
      "parent_id": null,
      "position": 0
    }
  ],
  "total": 12
}
```

---

### GET `/api/v1/public/docs/:slug`

Fetch a single published document by slug, with full `content` field.

Returns `404` if the slug doesn't exist **or** if the document is a draft (same error to prevent enumeration).

**Response `200 OK`:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Getting Started",
  "slug": "getting-started",
  "content": "# Getting Started\n\nWelcome to DocFlow...",
  "description": "Introduction to DocFlow",
  "tags": ["guide"],
  "status": "published",
  "parent_id": null,
  "position": 0,
  "author_id": "...",
  "author_name": "Admin User",
  "published_at": "2024-01-15T10:30:00Z",
  "created_at": "2024-01-15T09:00:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Error codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 404 | `DOC_NOT_FOUND` | Not found or not published |

---

### GET `/api/v1/public/nav`

Returns the full navigation tree for published documents, sorted by `position`.

**Response `200 OK`:**
```json
{
  "nav": [
    {
      "id": "...",
      "title": "Getting Started",
      "slug": "getting-started",
      "position": 0,
      "children": [
        {
          "id": "...",
          "title": "Installation",
          "slug": "installation",
          "position": 0,
          "children": []
        }
      ]
    }
  ]
}
```

---

### GET `/api/v1/public/search?q=<query>`

Full-text search across all published documents.

**Query parameters:**

| Param | Required | Default | Notes |
|-------|----------|---------|-------|
| `q` | ✅ | — | Min 2 characters |

**Response `200 OK`:**
```json
{
  "query": "authentication",
  "results": [
    {
      "id": "...",
      "title": "Authentication Guide",
      "slug": "authentication-guide",
      "snippet": "...JWT tokens are used for <mark>authentication</mark>. The access token expires...",
      "rank": 0.756,
      "description": "How to authenticate with the API"
    }
  ],
  "total": 3
}
```

> The `snippet` field contains up to 30 words of context with `<mark>` tags wrapping matched terms. Safe to render as HTML after sanitization.

**Error codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `QUERY_TOO_SHORT` | Query under 2 characters |

---

## Admin Endpoints

> All admin endpoints require `Authorization: Bearer <access_token>` header.

---

### GET `/api/v1/admin/docs`

List all documents (any status) with pagination and optional filtering.

**Query parameters:**

| Param | Default | Notes |
|-------|---------|-------|
| `page` | `1` | Page number |
| `page_size` | `20` | Max `100` |
| `status` | — | Filter: `draft` or `published` |

**Response `200 OK`:**
```json
{
  "data": [ ...document objects... ],
  "total": 47,
  "page": 1,
  "page_size": 20
}
```

---

### POST `/api/v1/admin/docs`

Create a new document. Always starts as `draft`.

**Request body:**
```json
{
  "title": "My New Page",
  "slug": "my-new-page",
  "content": "# My New Page\n\nContent here...",
  "description": "Optional short description",
  "tags": ["guide", "api"],
  "parent_id": null,
  "position": 0
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | ✅ | Non-empty string |
| `slug` | ✅ | URL-safe, globally unique |
| `content` | — | Markdown string |
| `description` | — | Short summary |
| `tags` | — | Array of strings |
| `parent_id` | — | UUID of parent doc, or `null` for root |
| `position` | — | Integer for sibling ordering |

**Response `201 Created`:** Full document object.

**Error codes:**

| HTTP | Code | Meaning |
|------|------|---------|
| 409 | `SLUG_TAKEN` | Slug already exists |

---

### GET `/api/v1/admin/docs/:id`

Get any document by UUID (includes drafts).

**Response `200 OK`:** Full document object including `content`.

---

### PUT `/api/v1/admin/docs/:id`

Update a document. All fields are optional (partial update).
Automatically saves a version snapshot **before** applying changes.

**Request body (all optional):**
```json
{
  "title": "Updated Title",
  "slug": "updated-slug",
  "content": "Updated content...",
  "description": "Updated description",
  "tags": ["updated"],
  "parent_id": "parent-uuid-or-null",
  "position": 1
}
```

**Response `200 OK`:** Updated document object.

---

### DELETE `/api/v1/admin/docs/:id`

Delete a document and all its version history (cascade).

**Response `200 OK`:**
```json
{ "message": "document deleted" }
```

---

### PATCH `/api/v1/admin/docs/:id/publish`

Transition a document from `draft` → `published`. Sets `published_at` timestamp.

**Response `200 OK`:**
```json
{ "message": "document published" }
```

---

### PATCH `/api/v1/admin/docs/:id/unpublish`

Transition a document from `published` → `draft`. Clears `published_at`.

**Response `200 OK`:**
```json
{ "message": "document unpublished" }
```

---

### PATCH `/api/v1/admin/docs/:id/move`

Move a document in the hierarchy (change parent and/or position).

**Request body:**
```json
{
  "parent_id": "new-parent-uuid-or-null",
  "position": 2
}
```

**Response `200 OK`:**
```json
{ "message": "document moved" }
```

---

### GET `/api/v1/admin/docs/:id/versions`

Retrieve the full version history for a document, newest first.

**Response `200 OK`:**
```json
{
  "versions": [
    {
      "id": "...",
      "document_id": "...",
      "title": "Title at time of save",
      "content": "Content snapshot...",
      "version": 3,
      "author_id": "...",
      "author_name": "Admin User",
      "created_at": "2024-01-15T14:00:00Z"
    }
  ],
  "total": 3
}
```

---

### GET `/api/v1/admin/stats`

Dashboard statistics.

**Response `200 OK`:**
```json
{
  "total_docs": 24,
  "published_docs": 18,
  "draft_docs": 6,
  "total_users": 3
}
```

---

### POST `/api/v1/admin/search/reindex`

Manually trigger a rebuild of the tsvector search index for all documents.
Normally the PostgreSQL trigger handles this automatically — only needed if the trigger was disabled or documents were bulk-inserted bypassing the trigger.

**Response `200 OK`:**
```json
{ "message": "search index rebuilt" }
```

---

## Health Check

### GET `/health`

No auth. Used by load balancers and monitoring.

**Response `200 OK`:**
```json
{ "status": "ok", "service": "docflow-api" }
```
