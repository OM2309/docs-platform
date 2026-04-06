# Database Schema

## Tables

### `documents`
Core entity. Supports hierarchy, tagging, FTS, and draft/publish.

```sql
id            UUID        PK
title         TEXT
slug          TEXT        UNIQUE  -- URL: /docs/:slug
content       TEXT                -- Markdown
description   TEXT
tags          TEXT[]
status        TEXT        CHECK (draft | published)
parent_id     UUID        FK → documents (self, nullable) -- hierarchy
position      INTEGER             -- sibling ordering
author_id     UUID        FK → users
published_at  TIMESTAMPTZ         -- null when draft
search_vector TSVECTOR            -- auto-updated by trigger
created_at    TIMESTAMPTZ
updated_at    TIMESTAMPTZ
```

### `users`
```sql
id        UUID  PK
email     TEXT  UNIQUE
name      TEXT
password  TEXT   -- bcrypt
role      TEXT   CHECK (admin | editor)
```

### `document_versions`
Append-only. One row inserted before every PUT.
```sql
id           UUID  PK
document_id  UUID  FK → documents (cascade delete)
title        TEXT  -- snapshot
content      TEXT  -- snapshot
version      INTEGER
author_id    UUID  FK → users
created_at   TIMESTAMPTZ
```

### `refresh_tokens`
```sql
id          UUID  PK
user_id     UUID  FK → users (cascade delete)
token       TEXT  UNIQUE
expires_at  TIMESTAMPTZ
```

---

## FTS Trigger

Fires on every INSERT/UPDATE to documents:

```sql
NEW.search_vector :=
  setweight(to_tsvector('english', title),       'A') ||
  setweight(to_tsvector('english', description), 'B') ||
  setweight(to_tsvector('english', content),     'C');
```

Title matches rank highest (A), body lowest (C).

---

## Indexes

```sql
GIN  search_vector          -- full-text search
GIN  title gin_trgm_ops     -- fuzzy fallback
     parent_id              -- tree traversal
     (parent_id, position)  -- ordered siblings
     status                 -- public filter
     slug                   -- URL lookup
     token                  -- refresh token lookup
```

---

## Key Decisions

**Self-referential `parent_id`** — simple adjacency list. Deleting a parent sets children's `parent_id` to NULL (orphan, not cascade). Chosen over materialized path for simplicity.

**`tags` as TEXT[]** — avoids a junction table. Fine for MVP; upgrade to a separate table if tag-based filtering at scale becomes a need.

**Versions are full snapshots** — not diffs. Simpler to restore. Storage cost acceptable at doc-writing frequency.

**TIMESTAMPTZ everywhere** — stores UTC, handles timezone correctly.
