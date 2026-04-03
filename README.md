<div align="center">

<h1>📄 DocFlow</h1>

<p><strong>A production-grade documentation platform — admin authoring, public read-only, full-text search, and hierarchical navigation.</strong></p>

<p>
  <img src="https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat-square&logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-336791?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/JWT-Auth-d63aff?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
</p>

<p>
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-api-reference">API Reference</a> ·
  <a href="#-database-schema">Database Schema</a> ·
  <a href="#%EF%B8%8F-engineering-notes">Engineering Notes</a>
</p>

</div>

---

## ✨ What is DocFlow?

DocFlow is a **GitBook / Confluence-style** documentation platform demonstrating a complete production full-stack system.

| Concern              | Approach                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| **Public docs**      | Drafts never leak — `status='published'` enforced at DB query level           |
| **Admin interface**  | JWT-gated, full document lifecycle with version snapshots                     |
| **Full-text search** | PostgreSQL `tsvector` + GIN index + weighted ranking + `ts_headline` snippets |
| **Navigation**       | Infinite hierarchy via adjacency list, assembled to tree at read time         |
| **Auth**             | 15-min access tokens + 7-day refresh with rotation, bcrypt passwords          |

---

## 🏗️ Architecture

### High-Level System Design

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              Browser                                      │
│                                                                            │
│     ┌─────────────────────────┐     ┌──────────────────────────────────┐  │
│     │  👤 Reader              │     │  🔐 Admin                        │  │
│     │  /docs/*                │     │  /admin/*                        │  │
│     │  (public, no login)     │     │  (auth-gated, CSR)               │  │
│     └────────────┬────────────┘     └──────────────────┬───────────────┘  │
└──────────────────┼──────────────────────────────────────┼─────────────────┘
                   │                                       │
                   ▼                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Next.js Frontend  :3000                                │
│                                                                            │
│   ┌───────────────────────────────┐   ┌───────────────────────────────┐  │
│   │  Server Components (SSR/ISR)  │   │  Client Components (CSR)      │  │
│   │  /docs/* pages                │   │  /admin/* pages               │  │
│   │  revalidate: 60s              │   │  Zustand auth store           │  │
│   │  SEO-optimized                │   │  Auto token refresh           │  │
│   └───────────────────────────────┘   └───────────────────────────────┘  │
│                                                                            │
│   ┌──────────────────────────────────────────────────────────────────┐    │
│   │  next.config.js  →  rewrites: /api/v1/* → http://localhost:8080  │    │
│   │  (no CORS headers needed — same domain in production)            │    │
│   └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────┬───────────────────────────────────┘
                                        │  /api/v1/* (proxied)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Go Backend  :8080  (Gin)                              │
│                                                                            │
│  ┌──────────────┐  ┌─────────────────────────┐  ┌──────────────────────┐ │
│  │ Auth Handler │  │   Public Handler         │  │   Admin Handler      │ │
│  │              │  │   (no auth required)     │  │   (JWT middleware)   │ │
│  │ POST /login  │  │                          │  │                      │ │
│  │ POST /register│ │ GET /public/docs/:slug   │  │ GET  /admin/docs     │ │
│  │ POST /refresh│  │ GET /public/nav          │  │ POST /admin/docs     │ │
│  │ POST /logout │  │ GET /public/search       │  │ PUT  /admin/docs/:id │ │
│  └──────────────┘  └─────────────────────────┘  │ PATCH .../publish    │ │
│                                                   └──────────────────────┘ │
│                         Repository Layer  (pgx/v5 raw SQL)                 │
└──────────────────────────────────────┬───────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Neon PostgreSQL                                       │
│                                                                            │
│  ┌──────────────┐  ┌──────────────────────┐  ┌────────────────────────┐  │
│  │   documents  │  │  document_versions   │  │   users                │  │
│  │              │  │  (append-only)       │  │                        │  │
│  │  tsvector ◄──┤  │                      │  │  bcrypt hash           │  │
│  │  GIN index   │  │  version snapshots   │  │  role: admin|editor    │  │
│  │  parent_id   │  │  on every PUT        │  └────────────────────────┘  │
│  │  status check│  └──────────────────────┘                               │
│  └──────────────┘                           ┌────────────────────────┐    │
│                                             │   refresh_tokens       │    │
│                                             │   (revocable logout)   │    │
│                                             └────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Trust Boundary

```
PUBLIC (no auth)                    PRIVATE (JWT required)
──────────────────────────────      ──────────────────────────────────────
GET  /api/v1/public/docs/*          GET    /api/v1/admin/docs
GET  /api/v1/public/nav             POST   /api/v1/admin/docs
GET  /api/v1/public/search          PUT    /api/v1/admin/docs/:id
POST /api/v1/auth/login             DELETE /api/v1/admin/docs/:id
POST /api/v1/auth/register          PATCH  /api/v1/admin/docs/:id/publish
POST /api/v1/auth/refresh           GET    /api/v1/admin/stats
```

> **Draft safety:** Public handlers always include `AND status = 'published'` in every SQL WHERE clause. Enforced at the repository layer — not middleware.

---

### Auth Token Lifecycle

```
LOGIN / REGISTER
─────────────────────────────────────────────────────────────────────
  Client                    Backend                    Database
    │                          │                           │
    │── POST /auth/login ──────►│                           │
    │                          │── SELECT user by email ──►│
    │                          │◄── bcrypt.Compare OK ─────│
    │                          │── INSERT refresh_token ──►│
    │◄── { access_token(15m), refresh_token(7d) } ─────────│

TOKEN REFRESH (when access_token expires)
─────────────────────────────────────────────────────────────────────
    │── POST /auth/refresh ────►│                           │
    │                          │── SELECT token ──────────►│
    │                          │── DELETE old token ───────►│  ← rotation
    │                          │── INSERT new token ───────►│
    │◄── { new_access_token, new_refresh_token } ───────────│

LOGOUT
─────────────────────────────────────────────────────────────────────
    │── POST /auth/logout ─────►│  (Bearer access_token)    │
    │                          │── DELETE all user tokens ─►│ ← all sessions
    │◄── 200 OK ────────────────│                           │
```

---

### Full-Text Search Pipeline

```
INDEXING  (auto, on every INSERT/UPDATE via PostgreSQL trigger)
──────────────────────────────────────────────────────────────────────────

  Document saved          PG Trigger fires            tsvector updated
  ┌──────────────┐  →   ┌──────────────────────┐  → ┌────────────────────┐
  │  title       │       │  update_search_      │    │  search_vector     │
  │  description │       │  vector()            │    │                    │
  │  content     │       │                      │    │  GIN index         │
  └──────────────┘       │  setweight(title,'A')│    │  O(log n) queries  │
                         │  setweight(desc, 'B')│    └────────────────────┘
                         │  setweight(body, 'C')│
                         └──────────────────────┘
                                                  Weights: A > B > C
                                                  (title matches rank highest)

QUERY PATH  (GET /public/search?q=jwt+authentication)
──────────────────────────────────────────────────────────────────────────

  User query     Normalize        GIN lookup          Rank + Snippet
  ┌──────────┐   ┌────────────┐   ┌──────────────┐   ┌─────────────────┐
  │"JWT auth"│──►│plainto_    │──►│search_vector │──►│ ts_rank_cd()    │
  └──────────┘   │tsquery()   │   │@@ query      │   │ cover density   │
                 │            │   │              │   │                 │
                 │ stemming   │   │ + status =   │   │ ts_headline()   │
                 │ stop words │   │ 'published'  │   │ <mark> tags     │
                 │ safe input │   └──────────────┘   │ 30-word context │
                 └────────────┘                      └─────────────────┘
                                                              │
                                       0 results? FALLBACK:   ▼
                                      ┌─────────────────────────────────┐
                                      │ ILIKE '%query%' via pg_trgm GIN │
                                      └─────────────────────────────────┘
```

---

## 📁 Project Structure

```
docflow/
├── backend/
│   ├── cmd/server/main.go               # Entry point, router, graceful shutdown
│   └── internal/
│       ├── auth/jwt.go                  # JWT generation + bcrypt
│       ├── config/config.go             # Env-based config
│       ├── db/db.go                     # pgxpool + inline SQL migrations
│       ├── handlers/
│       │   ├── auth.go                  # login / register / refresh / logout
│       │   ├── public.go                # docs, nav, search (no auth)
│       │   └── admin.go                 # CRUD + publish + versions (JWT)
│       ├── middleware/auth.go           # Bearer JWT middleware
│       ├── models/models.go             # Domain types + request/response DTOs
│       └── repository/repository.go    # All DB queries (raw SQL, no ORM)
│
└── frontend/
    ├── next.config.js                   # API proxy: /api/v1/* → backend
    └── src/
        ├── app/
        │   ├── page.tsx                 # Landing page
        │   ├── docs/                    # SSR public docs (ISR, revalidate: 60s)
        │   │   ├── layout.tsx           # Sidebar navigation + search bar
        │   │   ├── page.tsx             # Docs index
        │   │   └── [slug]/page.tsx      # Individual doc with markdown render
        │   └── admin/                   # CSR admin panel (auth-gated)
        │       ├── layout.tsx           # Sidebar + auth guard
        │       ├── page.tsx             # Dashboard with stats
        │       ├── login/page.tsx
        │       ├── documents/           # List / New / Edit
        │       └── settings/page.tsx
        ├── components/
        │   ├── admin/DocEditor.tsx      # Split-pane editor + live preview
        │   └── public/
        │       ├── PublicSidebar.tsx    # Tree nav (expand/collapse)
        │       ├── PublicSearchBar.tsx  # Debounced + Ctrl+K shortcut
        │       └── DocContent.tsx       # react-markdown GFM renderer
        ├── lib/api.ts                   # Fetch wrapper + auto token refresh
        ├── store/auth.ts                # Zustand auth store (persisted)
        └── types/index.ts               # Shared TypeScript types
```

---

## ⚡ Quick Start

### Prerequisites

- **Go** 1.23 &nbsp;&nbsp; `go version`
- **Node.js** 20+ &nbsp; `node --version`
- A **[Neon](https://neon.tech)** PostgreSQL database (free tier works)

### 1 — Configure & Start Backend

```bash
cd backend
cp .env.example .env
# Edit .env: fill in DATABASE_URL and JWT_SECRET (required)

go mod download
go run ./cmd/server
# ✓ DocFlow API running on port 8080
# ✓ GET http://localhost:8080/health → { "status": "ok" }
```

### 2 — Start Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
# ✓ http://localhost:3000
```

### 3 — Create Admin User

```bash
# Windows
curl -X POST http://localhost:8080/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@example.com\",\"name\":\"Admin\",\"password\":\"securepassword\",\"role\":\"admin\"}"

# macOS / Linux
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","name":"Admin","password":"securepassword","role":"admin"}'
```

### 4 — Open

| URL                            | Purpose                    |
| ------------------------------ | -------------------------- |
| `http://localhost:3000`        | Landing page               |
| `http://localhost:3000/docs`   | Public documentation (SSR) |
| `http://localhost:3000/admin`  | Admin panel → login        |
| `http://localhost:8080/health` | API health check           |

---

## 🌍 Environment Variables

### Backend (`backend/.env`)

| Variable          | Required | Default                 | Description                                 |
| ----------------- | -------- | ----------------------- | ------------------------------------------- |
| `DATABASE_URL`    | ✅       | —                       | Neon connection string (`?sslmode=require`) |
| `JWT_SECRET`      | ✅       | —                       | Min 32-char random string                   |
| `PORT`            | —        | `8080`                  | Server listen port                          |
| `ENVIRONMENT`     | —        | `development`           | `development` or `production`               |
| `ALLOWED_ORIGINS` | —        | `http://localhost:3000` | Comma-separated CORS origins                |
| `JWT_EXPIRY`      | —        | `15m`                   | Access token lifetime                       |
| `REFRESH_EXPIRY`  | —        | `7d`                    | Refresh token lifetime                      |

### Frontend (`frontend/.env.local`)

| Variable              | Default                 | Description                      |
| --------------------- | ----------------------- | -------------------------------- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Backend origin for Next.js proxy |

---

## 📡 API Reference

> **Base URL:** `http://localhost:8080/api/v1`
> **Proxy URL:** `/api/v1` (via `next.config.js` rewrites)
> **Auth header:** `Authorization: Bearer <access_token>`
> **Error format:** `{ "error": "message", "code": "MACHINE_CODE" }`

### Authentication

| Method | Endpoint         | Description                                                |
| ------ | ---------------- | ---------------------------------------------------------- |
| `POST` | `/auth/register` | Register — returns `{ access_token, refresh_token, user }` |
| `POST` | `/auth/login`    | Login — returns `{ access_token, refresh_token, user }`    |
| `POST` | `/auth/refresh`  | Rotate refresh token — returns new pair, deletes old       |
| `POST` | `/auth/logout`   | Revoke all refresh tokens for user                         |
| `GET`  | `/auth/me`       | Current user profile                                       |

### Public Endpoints (no auth)

| Method | Endpoint             | Description                                                      |
| ------ | -------------------- | ---------------------------------------------------------------- |
| `GET`  | `/public/docs`       | All published docs, metadata only (no `content` field)           |
| `GET`  | `/public/docs/:slug` | Single published doc with full content. Returns `404` for drafts |
| `GET`  | `/public/nav`        | Hierarchical nav tree sorted by `position`                       |
| `GET`  | `/public/search?q=`  | FTS with ranked results + `ts_headline` snippets                 |

### Admin Endpoints (JWT required)

| Method   | Endpoint                    | Description                                               |
| -------- | --------------------------- | --------------------------------------------------------- |
| `GET`    | `/admin/docs`               | All docs any status. Supports `?page=&page_size=&status=` |
| `POST`   | `/admin/docs`               | Create doc (starts as `draft`)                            |
| `GET`    | `/admin/docs/:id`           | Get doc by ID (includes drafts)                           |
| `PUT`    | `/admin/docs/:id`           | Update. Saves version snapshot before writing             |
| `DELETE` | `/admin/docs/:id`           | Delete doc + all versions (cascade)                       |
| `PATCH`  | `/admin/docs/:id/publish`   | Set `status=published`, set `published_at`                |
| `PATCH`  | `/admin/docs/:id/unpublish` | Set `status=draft`, clear `published_at`                  |
| `PATCH`  | `/admin/docs/:id/move`      | Change `parent_id` + `position`                           |
| `GET`    | `/admin/docs/:id/versions`  | Version history (newest first)                            |
| `GET`    | `/admin/stats`              | `{ total_docs, published_docs, draft_docs, total_users }` |
| `POST`   | `/admin/search/reindex`     | Rebuild tsvector index for all documents                  |

---

## 🗄️ Database Schema

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID v4 generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Trigram fuzzy search fallback

-- Users
CREATE TABLE users (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email      TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    password   TEXT NOT NULL,                          -- bcrypt (cost 12)
    role       TEXT NOT NULL DEFAULT 'editor'
               CHECK (role IN ('admin', 'editor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents (core entity)
CREATE TABLE documents (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title         TEXT NOT NULL,
    slug          TEXT UNIQUE NOT NULL,                -- URL: /docs/:slug
    content       TEXT NOT NULL DEFAULT '',            -- Markdown
    description   TEXT,
    tags          TEXT[] DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published')),
    parent_id     UUID REFERENCES documents(id)        -- Self-referential hierarchy
                  ON DELETE SET NULL,                  -- Parent delete orphans children
    position      INTEGER NOT NULL DEFAULT 0,
    author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    published_at  TIMESTAMPTZ,
    search_vector tsvector,                            -- Auto-maintained by trigger
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FTS Trigger (fires on every INSERT / UPDATE)
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title,       '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.content,     '')), 'C');
    RETURN NEW;                              -- Weight: A(title) > B(desc) > C(body)
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_search_vector_update
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- Version history (append-only snapshots)
CREATE TABLE document_versions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    version     INTEGER NOT NULL,                      -- Monotonically increasing per doc
    author_id   UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()     -- Never updated
);

-- Refresh tokens (server-side revocation)
CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT UNIQUE NOT NULL,                   -- Opaque UUID (not a JWT)
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_search   ON documents USING GIN(search_vector);       -- FTS
CREATE INDEX idx_documents_trgm     ON documents USING GIN(title gin_trgm_ops); -- Fuzzy fallback
CREATE INDEX idx_documents_parent   ON documents(parent_id);                    -- Tree traversal
CREATE INDEX idx_documents_status   ON documents(status);                       -- Public filter
CREATE INDEX idx_documents_slug     ON documents(slug);                         -- URL lookup
CREATE INDEX idx_documents_position ON documents(parent_id, position);          -- Ordered siblings
CREATE INDEX idx_versions_doc       ON document_versions(document_id);
CREATE INDEX idx_refresh_tokens_tok ON refresh_tokens(token);
```

### Entity Relationships

```
users ──────────────────────────────────────────────────────────┐
  │  1:N (author_id)                                            │ 1:N
  ▼                                                             ▼
documents ──────────── 1:N ──────────► document_versions   refresh_tokens
  │  self-ref (parent_id)
  └──────────► documents (children)
```

---

## ⚙️ Engineering Notes

### Search: PostgreSQL FTS vs External Engine

**Chosen: Native tsvector + GIN index**

```
✅  Zero infra — no extra service to deploy or monitor
✅  Atomically consistent with document writes
✅  ts_headline provides snippet extraction out of the box
✅  Trigram fallback (pg_trgm) handles partial/fuzzy matches

⚠️  No typo tolerance
⚠️  English stemming only
⚠️  Relevance tuning is limited vs Meilisearch/Algolia
```

Scale trigger: switch to Meilisearch when dataset exceeds ~500k docs or multi-language support is needed.

---

### Hierarchy: Adjacency List vs Alternatives

**Chosen: `parent_id` self-referential foreign key**

```
✅  Simple inserts/updates (single row)
✅  Unlimited nesting depth
✅  ON DELETE SET NULL — parent delete orphans, not cascades

⚠️  Tree assembly is O(n) read-time in Go
⚠️  No DB-level subtree queries without recursive CTE

Alternative: ltree (materialized path) for fast subtree reads
Alternative: LexoRank strings instead of integer position
```

---

### Auth: JWT Strategy

```
Access token  15m   → Stateless JWT, no DB lookup per request
Refresh token  7d   → Opaque UUID in DB, rotated on every use
                      DELETE old → INSERT new (prevents replay)
Logout              → DELETE all refresh tokens for user (all sessions)

Hardening path: HttpOnly Secure cookie + CSRF token (vs localStorage)
```

---

### API Proxy: Why No CORS?

`next.config.js` rewrites `/api/v1/*` → `http://localhost:8080/api/v1/*`

In production both services share the same domain, so no `Access-Control-Allow-Origin` headers are needed and no OPTIONS preflight requests are made.

---

### Scalability Roadmap

```
Phase 1 (today)    Single Go instance + Neon Postgres + Next.js ISR
Phase 2            Multiple API replicas (stateless JWT = trivial)
Phase 3            DB pooling (pgBouncer or Neon built-in)
Phase 4            Multi-tenant: spaces table, (space_id, slug) unique index
Phase 5            CDN tag-based cache purge on publish/unpublish
```

---

### Explicit Assumptions

| Assumption             | Implication                               |
| ---------------------- | ----------------------------------------- |
| Single tenant          | Slugs globally unique; no space scoping   |
| English content        | PostgreSQL `'english'` FTS dictionary     |
| External image hosting | No file upload handling in backend        |
| Last-write-wins        | No optimistic locking on concurrent edits |
| TLS at edge            | Backend trusts proxy; no in-process TLS   |

---

## 📦 Deliverables

| Item                  | Location                        |
| --------------------- | ------------------------------- |
| Backend (Go)          | `backend/`                      |
| Frontend (Next.js)    | `frontend/`                     |
| Setup (Windows)       | `setup.bat`                     |
| API docs              | This README → API Reference     |
| DB schema             | This README → Database Schema   |
| Engineering notes     | This README → Engineering Notes |
| Architecture diagrams | `ARCHITECTURE_DIAGRAMS.html`    |

---

## 🪪 License

MIT — assignment / demo project.

---

<div align="center">
  <sub>Built with Go 1.26 · Next.js 14 · Neon PostgreSQL · Tailwind CSS · JWT</sub>
</div>
