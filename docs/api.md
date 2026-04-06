# API Reference

Base URL: `http://localhost:8080/api/v1`

Auth: `Authorization: Bearer <access_token>` on all `/admin/*` routes.

Errors always return: `{ "error": "message", "code": "CODE" }`

---

## Auth

| Method | Endpoint | Body | Notes |
|--------|----------|------|-------|
| POST | `/auth/register` | `{ email, name, password, role }` | role: admin \| editor |
| POST | `/auth/login` | `{ email, password }` | |
| POST | `/auth/refresh` | `{ refresh_token }` | Rotates token |
| POST | `/auth/logout` | — | Revokes all sessions |
| GET | `/auth/me` | — | Current user |

All auth responses return: `{ access_token, refresh_token, user }`

---

## Public (no auth)

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/public/docs` | Published docs, metadata only |
| GET | `/public/docs/:slug` | Full content. 404 if draft or missing |
| GET | `/public/nav` | Hierarchy tree sorted by position |
| GET | `/public/search?q=` | FTS results with snippets. Min 2 chars |

---

## Admin (JWT required)

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/admin/docs` | All docs. Supports `?status=&page=&page_size=` |
| POST | `/admin/docs` | Create. Always starts as draft |
| GET | `/admin/docs/:id` | Single doc including drafts |
| PUT | `/admin/docs/:id` | Update. Saves version snapshot first |
| DELETE | `/admin/docs/:id` | Deletes doc + all versions |
| PATCH | `/admin/docs/:id/publish` | draft → published |
| PATCH | `/admin/docs/:id/unpublish` | published → draft |
| PATCH | `/admin/docs/:id/move` | `{ parent_id, position }` |
| GET | `/admin/docs/:id/versions` | Version history, newest first |
| GET | `/admin/stats` | `{ total_docs, published_docs, draft_docs, total_users }` |

---

## Health

`GET /health` → `{ "status": "ok" }`
