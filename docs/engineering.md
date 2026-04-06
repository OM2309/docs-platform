# Engineering Notes

## Problem

Teams need a place to write, manage, and publish documentation. Authors need a private editor. Readers need fast, searchable public pages. Drafts must never leak.

## Use Cases

1. **Author** logs in → creates/edits a doc → saves as draft → publishes when ready
2. **Reader** visits `/docs/:slug` → reads the page → searches for a topic
3. **Author** unpublishes a doc → it immediately disappears from public view

---

## Architecture (in one line per layer)

```
Browser → Next.js (SSR for /docs, CSR for /admin) → Go API → PostgreSQL
```

**Public docs use SSR** — pages render on the server, cache for 60s. Fast for readers, good for SEO.

**Admin uses CSR** — no need to SSR authenticated pages. Simpler auth flow, better UX.

**API proxy in next.config.js** — frontend rewrites `/api/v1/*` to the Go backend. No CORS headers needed.

---

## Key Decisions

**Go + Gin** — simple HTTP framework, good middleware grouping for auth on `/admin/*` routes.

**Raw SQL (pgx)** — needed PostgreSQL-specific FTS features (`tsvector`, `ts_rank_cd`, `ts_headline`) that don't map well to ORMs.

**Adjacency list for hierarchy** — `parent_id` on the documents table. Simple to write, tree assembled in Go at read time. Good enough for doc sites (rarely >500 pages).

**PostgreSQL FTS** — `tsvector` column maintained by a trigger. GIN index for fast lookups. Chose this over Meilisearch to keep the stack simple — no extra service to run.

**JWT (15min) + Refresh token (7 days)** — access token is stateless, refresh token is stored in DB so logout actually revokes sessions.

---

## Search

On every save → trigger updates `search_vector`:
- Title → weight A (highest)
- Description → weight B
- Content → weight C (lowest)

Query uses `plainto_tsquery` (safe for plain user input) + `ts_rank_cd` for ranking + `ts_headline` for snippets.

If FTS returns nothing → fallback to trigram ILIKE via `pg_trgm`.

---

## Draft / Publish

```
draft → [publish] → published → [unpublish] → draft
```

Draft safety enforced at 3 layers: route separation, JWT middleware, and `WHERE status='published'` in every public SQL query.

---

## Trade-offs

| Decision | Why |
|---|---|
| Adjacency list (not materialized path) | Simpler writes; tree is small |
| Postgres FTS (not Meilisearch) | Zero extra infra for MVP |
| Full snapshots for versions (not diffs) | Simpler to restore; low write frequency |
| CSR admin (not SSR) | Auth on server adds complexity for no real gain |
| localStorage for tokens (not HttpOnly cookie) | Simpler for MVP; cookie + CSRF is the hardening step |

## Assumptions

- Single tenant — slugs are globally unique
- English content only (FTS uses english dictionary)
- Images hosted externally — no upload handling
- Low write frequency — full version snapshots are fine on storage
