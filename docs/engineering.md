# Engineering Notes

## Overview

DocFlow is a documentation platform built in **2–3 days** as a submission demonstrating full-stack engineering thinking: not just "it works" but *why* each decision was made and what the trade-offs are.

The guiding principle throughout: **simple and correct over clever and fragile**.

---

## Architecture

### System Overview

```
Browser
  │
  ├─── /docs/*  ──────►  Next.js Server Components  (SSR + ISR)
  │                         │  fetch at build/revalidate time
  │                         └──► Go Backend ──► Neon PostgreSQL
  │
  └─── /admin/* ──────►  Next.js Client Components  (CSR)
                            │  fetch on user interaction
                            └──► Go Backend ──► Neon PostgreSQL
                                  (JWT middleware on all /admin/* routes)
```

### Frontend Architecture

The frontend uses **Next.js 14 App Router** with a deliberate split:

**Public docs → Server Components (SSR + ISR)**
- Pages under `/docs/*` are rendered on the server
- `fetch()` calls include `{ next: { revalidate: 60 } }` — pages are cached and refreshed every 60 seconds
- Result: fast initial load, SEO-friendly HTML, no flash of loading state
- Public readers never need JavaScript to see content

**Admin panel → Client Components (CSR)**
- Pages under `/admin/*` are fully client-side
- Auth guard runs in the layout — redirects to `/admin/login` if no valid session
- State managed with Zustand (auth store) + local useState (page data)
- Optimistic UI patterns where appropriate (delete, status toggle)

**Why the split?**

Public docs are read by anonymous users. They benefit from SSR:
- Search engines index the full content
- First paint is fast (no API waterfall)
- CDN can cache the rendered HTML

Admin is used by authenticated editors. SSR adds complexity here (auth on the server, revalidation on every action). CSR is simpler and the UX is better — no full-page reloads.

### API Proxy

`next.config.js` rewrites `/api/v1/*` to the Go backend:

```js
async rewrites() {
  return [{
    source: '/api/v1/:path*',
    destination: 'http://localhost:8080/api/v1/:path*'
  }]
}
```

**Why this matters:**

In production, both the frontend and backend sit behind the same domain. The browser sees only one origin — no CORS headers needed, no OPTIONS preflight requests. This is simpler to configure and slightly more secure (no wildcard CORS).

### Backend Architecture

The Go backend follows a **clean layered architecture**:

```
HTTP Request
    │
    ▼
Gin Router + Middleware (CORS, Recovery, Logger, Auth)
    │
    ▼
Handler (parse request, validate, call service)
    │
    ▼
Repository (all SQL queries, no business logic)
    │
    ▼
PostgreSQL (Neon)
```

**Why no service layer?**

For this project scope, a service layer between handlers and repository would be pure boilerplate — it would just pass calls through. I kept handlers and repository as the two layers. If the project grows (background jobs, complex business rules, event publishing), a service layer would be the right next step.

**Why Gin over Chi/stdlib?**

Gin was chosen for:
- Route groups (clean `/admin/*` grouping with middleware applied to the group)
- Built-in JSON binding and validation
- Middleware composition
- `gin-contrib/cors` for CORS configuration

Chi is equally valid. The stdlib `net/http` with a simple mux would also work but requires more boilerplate for grouped middleware.

**Why raw SQL (pgx) over an ORM?**

```
With ORM (GORM/sqlc):
  - Less boilerplate for simple CRUD
  - Abstracts away PostgreSQL-specific features
  - Harder to write the FTS query (ts_rank, ts_headline, plainto_tsquery)
  - Harder to debug what SQL is actually running

With raw SQL (pgx):
  - Full control over every query
  - PostgreSQL-specific features are first-class (tsvector, GIN, CTEs)
  - Easy to add EXPLAIN ANALYZE when debugging performance
  - Slightly more boilerplate but completely transparent
```

For a project that depends heavily on PostgreSQL-specific features (FTS, GIN index, triggers), raw SQL is the right choice. The FTS query alone — `ts_rank_cd`, `ts_headline`, `plainto_tsquery`, `@@ operator` — would require significant ORM workarounds.

---

## API Design

### RESTful with Practical Deviations

The API follows REST conventions with two intentional deviations:

**1. Publish/unpublish as separate endpoints**

```
PATCH /admin/docs/:id/publish
PATCH /admin/docs/:id/unpublish
```

Rather than `PATCH /admin/docs/:id` with `{ "status": "published" }`.

**Why:** Status transition is a domain event, not just a field update. Separating them makes the intent explicit in logs and audit trails. "Published document X" is clearer than "Updated field `status` on document X".

**2. DELETE returns 200 with body (not 204 No Content)**

```json
{ "message": "document deleted" }
```

**Why:** 204 is semantically correct but makes frontend error handling harder — there's no body to read if the deletion fails for a business reason. A consistent `{ "message": ... }` or `{ "error": ... }` shape across all responses is simpler to consume.

### Structured Errors

Every error response has the same shape:

```json
{
  "error": "human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": "optional extra context"
}
```

**`code`** enables frontend code to branch on specific error types without string-matching error messages:

```typescript
if (err.code === 'SLUG_TAKEN') {
  setError('This URL is already in use. Try a different slug.');
}
```

### Versioning

The API is under `/api/v1/`. This is intentional even for a v1 — it means a future `/api/v2/` can coexist without breaking existing clients during migration.

---

## Data Modeling

### Document Hierarchy: Adjacency List

```sql
parent_id UUID REFERENCES documents(id) ON DELETE SET NULL
```

The tree is assembled in Go after a single `SELECT * FROM documents WHERE status='published'` query. The assembly is O(n) — build a map of all nodes, then attach children to parents in a second pass.

**Why not use a recursive CTE to get the tree from the DB?**

```sql
-- This works but is harder to cache and harder to paginate
WITH RECURSIVE doc_tree AS (
  SELECT * FROM documents WHERE parent_id IS NULL
  UNION ALL
  SELECT d.* FROM documents d
  JOIN doc_tree dt ON d.parent_id = dt.id
)
SELECT * FROM doc_tree;
```

For the navigation endpoint (which returns the full tree), a single flat query + Go assembly is simpler and the n is small (documentation sites rarely exceed a few hundred pages). Recursive CTEs would be the right upgrade if subtree queries became necessary (e.g., "delete this section and all its children").

### Slug Uniqueness

Slugs are globally unique. `GET /docs/my-page` always resolves unambiguously.

**Trade-off:** This means `/docs/installation` can only exist once across the entire site. For a multi-tenant platform, you'd scope slugs to a space: `(space_id, slug) UNIQUE`. Noted in assumptions.

### `updated_at` Trigger Gap

The `updated_at` column is set by the application (`NOW()` in the UPDATE query), not by a DB trigger. In a high-concurrency scenario, this could be slightly off if two updates race. For this project scope, application-set timestamps are fine. A DB trigger would be more correct for strict audit requirements.

---

## Search Approach

### PostgreSQL Full-Text Search

**The full pipeline:**

```
1. Document saved/updated
   └─► PostgreSQL trigger fires automatically
       └─► search_vector = (
             setweight(to_tsvector('english', title),       'A') ||
             setweight(to_tsvector('english', description), 'B') ||
             setweight(to_tsvector('english', content),     'C')
           )

2. User searches for "JWT authentication"
   └─► plainto_tsquery('english', 'JWT authentication')
       └─► Normalized to: 'jwt' & 'authent' (stemmed, lowercased)
       └─► GIN index lookup: O(log n)
       └─► ts_rank_cd() ranks results by cover density
       └─► ts_headline() extracts 30-word snippets with <mark> tags

3. If FTS returns 0 results:
   └─► Fallback: ILIKE '%query%' using pg_trgm GIN index
       └─► Handles partial matches, short queries
```

**Why `plainto_tsquery` instead of `to_tsquery`?**

`to_tsquery` requires the user to write valid FTS syntax (`JWT & authentication`). A user typing `JWT authentication` would cause a parse error. `plainto_tsquery` treats the input as plain text and constructs the query safely — essential for user-facing search.

**Why `ts_rank_cd` (cover density) instead of `ts_rank`?**

`ts_rank_cd` rewards documents where query terms appear close together. For documentation, this is more accurate: a document about "JWT authentication flow" where both terms appear in the same paragraph is more relevant than one where "JWT" appears in the intro and "authentication" appears in an unrelated section.

**Snippet extraction:**

```sql
ts_headline('english', content,
    plainto_tsquery('english', $1),
    'MaxWords=30, MinWords=15, StartSel=<mark>, StopSel=</mark>'
) AS snippet
```

The frontend renders snippets with `dangerouslySetInnerHTML` after confirming that `<mark>` is the only injected HTML (server-controlled, not user-controlled).

**Trigram fallback:**

When FTS returns no results (common for 2-3 character queries or product names that don't stem well), the application falls back to trigram-based ILIKE search via `pg_trgm`. This handles:
- Partial matches: "auth" → "authentication"
- Product names: "JWT" → matches "JWT" exactly
- Mixed case: case-insensitive via ILIKE

---

## Trade-offs and Assumptions

### Trade-offs Made

**1. Adjacency list over materialized path**
- Chose simplicity of writes over efficiency of subtree reads
- Acceptable because doc trees are small and read-time assembly is fast

**2. PostgreSQL FTS over Meilisearch/Algolia**
- Chose zero infrastructure over better search quality
- Acceptable for MVP; clear upgrade path documented

**3. Full version snapshots over diffs**
- Chose simplicity of restore over storage efficiency
- Acceptable because docs are written infrequently (low write volume)

**4. Integer `position` over LexoRank**
- Chose simple ordering over gap-free reordering
- Acceptable for MVP; LexoRank upgrade path is clear

**5. Client-side admin over server-side**
- Chose simpler auth flow over SSR performance on admin
- Acceptable because admins are a small, known set of users; SEO irrelevant

**6. localStorage for refresh token over HttpOnly cookie**
- Chose simplicity over maximum XSS resistance
- Production hardening path: HttpOnly + SameSite=Strict cookie + CSRF token

**7. Raw SQL over ORM**
- Chose transparency and PostgreSQL feature access over less boilerplate
- Worth it specifically because FTS queries don't map well to ORMs

### Explicit Assumptions

| Assumption | What changes if this changes |
|------------|------------------------------|
| Single tenant | Add `spaces` table; scope slug uniqueness to `(space_id, slug)` |
| English content | Change `'english'` dictionary in FTS to appropriate language or `'simple'` |
| External image hosting | Add file upload endpoint + S3 presigned URL flow |
| Last-write-wins | Add `updated_at` optimistic locking check on PUT requests |
| Small document count (<10k) | Add pagination to nav endpoint; cache nav tree in Redis |
| Infrequent writes | If write-heavy, move to diff-based versioning to reduce storage |

### What Was Not Built (and Why)

| Feature | Reason skipped |
|---------|----------------|
| Real-time collaboration | Requires OT/CRDT — significant complexity, out of scope |
| Per-document ACLs | Single tenant assumption; role-based at user level is sufficient |
| WYSIWYG editor | Markdown is simpler, more portable, and easier to store |
| Email notifications | No SMTP integration; out of scope for this assignment |
| Rate limiting | Not implemented at app level; belongs at reverse proxy/CDN |
| Soft deletes | Hard deletes with cascade are simpler and cleaner for this scope |

---

## Draft / Publish States

Documents have two states: `draft` and `published`.

```
  [Create]
      │
      ▼
  ┌────────┐    PATCH /publish    ┌───────────┐
  │  DRAFT │ ──────────────────► │ PUBLISHED  │
  │        │ ◄────────────────── │            │
  └────────┘   PATCH /unpublish  └───────────┘
      │                               │
      │ DELETE                        │ DELETE
      ▼                               ▼
   (removed)                      (removed)
```

**Draft safety is enforced at three independent layers:**

1. **Route layer:** `/public/*` vs `/admin/*` separation
2. **Middleware layer:** JWT required for admin routes
3. **Database layer:** `WHERE status = 'published'` in every public query

Even if the middleware were misconfigured, a draft document cannot be returned by the public repository method because the SQL itself filters it out.

---

## Document Versioning

Every `PUT /admin/docs/:id` request:

1. Reads the current document state
2. Inserts a `document_versions` row with the **current** content (snapshot before the change)
3. Then applies the update

This means versions represent "what the document looked like before this edit", not "what the document looks like now". The current state is always in `documents`.

**Version numbers** are per-document and monotonically increasing:
```sql
SELECT COALESCE(MAX(version), 0) + 1 FROM document_versions WHERE document_id = $1
```

**Restoration:** Not implemented in the UI (time constraint), but the data model fully supports it: take any version's `title` and `content` and call `PUT /admin/docs/:id` with those values.

---

## Performance Optimizations

### Implemented

**1. Database connection pooling**
```go
cfg.MaxConns = 25
cfg.MinConns = 5
cfg.MaxConnLifetime = 1 * time.Hour
cfg.MaxConnIdleTime = 30 * time.Minute
```
Prevents connection storms under load. Critical for serverless Postgres (Neon) where connection setup is slower.

**2. Selective field projection on public list endpoint**
`GET /public/docs` returns metadata only (no `content` field). The `content` column can be tens of kilobytes — omitting it from the list endpoint reduces payload size by 10-100x.

**3. `.lean()` equivalent — no unnecessary joins**
Public list queries don't join `users` for `author_name` (not needed in list view). Full join only on single-document fetch.

**4. ISR on public doc pages (Next.js)**
```typescript
fetch(url, { next: { revalidate: 60 } })
```
Published docs are cached at the CDN edge. Re-fetched from the backend at most once per minute. Subsequent requests are served from cache — zero DB queries.

**5. GIN indexes for FTS and trigram**
GIN (Generalized Inverted Index) is the correct index type for `tsvector` and `gin_trgm_ops`. A B-tree index on these types would be useless. With GIN, FTS queries on a million documents run in milliseconds.

### Not Implemented (but documented)

**1. Navigation tree caching**
The nav tree is re-assembled on every request to `/public/nav`. For sites with thousands of pages, cache this in Redis with a TTL of 60s. Invalidate on publish/unpublish events.

**2. Search result caching**
Popular search queries (top 100 terms) could be cached in Redis. Low implementation cost, high traffic reduction.

**3. CDN cache-tag purging**
On publish/unpublish, purge the specific CDN cache entry for that slug. Currently handled by ISR TTL (eventually consistent). Cloudflare or Fastly support tag-based purge for instant cache invalidation.

**4. DB query analysis**
`EXPLAIN ANALYZE` on production query patterns before adding indexes. Current indexes are based on expected query patterns — production traffic may reveal different hotspots.
