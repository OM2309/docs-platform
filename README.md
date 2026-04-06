<div align="center">

<h1>DocFlow</h1>

<p>Documentation platform — admin authoring, public read-only, full-text search, hierarchical navigation.</p>

<p>
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/JWT-Auth-d63aff?style=flat-square" />
</p>

</div>

---

## Stack

| Layer | Choice |
|---|---|
| Backend | Go + Gin + pgx (raw SQL) |
| Frontend | Next.js 14 App Router |
| Database | Neon PostgreSQL |
| Auth | JWT (15m access) + Refresh token (7d, DB-backed) |
| Search | PostgreSQL FTS — tsvector + GIN index |

---

## Architecture

```
Browser
  ├── /docs/*   → Next.js Server Components (SSR, ISR 60s) → Go API → Postgres
  └── /admin/*  → Next.js Client Components (CSR, auth-gated) → Go API → Postgres

next.config.js rewrites /api/v1/* → Go backend  (no CORS needed)
```

**Public docs** are server-rendered and cached — fast, SEO-friendly, no JS required.  
**Admin panel** is client-side — simpler auth flow, no full-page reloads.  
**Draft safety** enforced at DB level: every public query filters `status = 'published'`.

---

## Quick Start

**Prerequisites:** Go 1.22+ · Node.js 18+

### Backend

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL and JWT_SECRET in .env

go mod tidy
go run ./cmd/server
# → http://localhost:8080/health
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:8080

npm install
npm run dev
# → http://localhost:3000
```

### Create first admin user

```bash
# Windows
curl -X POST http://localhost:8080/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"name\":\"Admin\",\"password\":\"yourpassword\",\"role\":\"admin\"}"

# macOS / Linux
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","name":"Admin","password":"yourpassword","role":"admin"}'
```

Then open `http://localhost:3000/admin` and sign in.

---

## Environment Variables

### `backend/.env`

```env
DATABASE_URL=postgresql://...?sslmode=require   # required
JWT_SECRET=min-32-chars                          # required
PORT=8080
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:3000
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## API

Base: `http://localhost:8080/api/v1` — or via proxy: `/api/v1`  
Auth: `Authorization: Bearer <access_token>`

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | — | Returns token pair |
| POST | `/auth/login` | — | Returns token pair |
| POST | `/auth/refresh` | — | Rotates refresh token |
| POST | `/auth/logout` | JWT | Revokes all sessions |
| GET | `/public/docs` | — | Published docs (no content field) |
| GET | `/public/docs/:slug` | — | Full content. 404 if draft |
| GET | `/public/nav` | — | Full nav tree |
| GET | `/public/search?q=` | — | FTS with snippets |
| GET | `/admin/docs` | JWT | All docs, any status |
| POST | `/admin/docs` | JWT | Create (starts as draft) |
| PUT | `/admin/docs/:id` | JWT | Update, saves version first |
| DELETE | `/admin/docs/:id` | JWT | Hard delete + cascade |
| PATCH | `/admin/docs/:id/publish` | JWT | draft → published |
| PATCH | `/admin/docs/:id/unpublish` | JWT | published → draft |
| GET | `/admin/docs/:id/versions` | JWT | Version history |
| GET | `/admin/stats` | JWT | Dashboard counts |

---

## Database Schema

```sql
users              — email, bcrypt password, role (admin|editor)
documents          — title, slug (unique), content (markdown), status, parent_id (self-ref), tsvector
document_versions  — append-only snapshots saved before every PUT
refresh_tokens     — opaque UUID, expires_at, revocable on logout
```

FTS trigger on documents — auto-updates `search_vector` on every save:
```sql
setweight(to_tsvector('english', title),       'A')  -- highest rank
setweight(to_tsvector('english', description), 'B')
setweight(to_tsvector('english', content),     'C')  -- lowest rank
```

---

## Docs

| File | Contents |
|---|---|
| `docs/api.md` | Full endpoint reference |
| `docs/schema.md` | Schema + design decisions |
| `docs/schema.sql` | Raw SQL |
| `docs/engineering.md` | Architecture, trade-offs, assumptions |
| `ARCHITECTURE_DIAGRAMS.html` | Visual diagrams (open in browser) |
