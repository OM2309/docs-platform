# Database Schema

## Technology Choice

**PostgreSQL on Neon** (serverless Postgres).

Why Postgres over alternatives:

| Option | Verdict | Reason |
|--------|---------|--------|
| PostgreSQL | ✅ Chosen | Native FTS, `tsvector`, `GIN` index, ACID, `uuid-ossp`, `pg_trgm` — everything needed in one engine |
| MySQL | ❌ | Weaker FTS, no native UUID type, less expressive |
| MongoDB | ❌ | No native FTS at this quality level, eventual consistency complications for draft/publish |
| SQLite | ❌ | No FTS with weighted ranking, not production-ready for multi-user |

---

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Provides uuid_generate_v4() for primary keys
-- Guaranteed uniqueness across distributed systems

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- Trigram-based similarity matching
-- Powers fuzzy search fallback when FTS returns no results
-- Enables GIN index on title for ILIKE queries
```

---

## Tables

### `users`

Stores admin and editor accounts.

```sql
CREATE TABLE users (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email      TEXT        UNIQUE NOT NULL,
    name       TEXT        NOT NULL,
    password   TEXT        NOT NULL,          -- bcrypt hash, cost factor 12
    role       TEXT        NOT NULL DEFAULT 'editor'
                           CHECK (role IN ('admin', 'editor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Key decisions:**
- `password` stores only the bcrypt hash — plaintext never persists
- `role` uses a CHECK constraint — invalid roles are rejected at DB level, not just application level
- `email` has a UNIQUE constraint — enforced at DB level even if application validation is bypassed

---

### `documents`

The core content entity. Supports hierarchy, versioning, tagging, and full-text search.

```sql
CREATE TABLE documents (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    title         TEXT        NOT NULL,
    slug          TEXT        UNIQUE NOT NULL,
    -- slug is the URL path: /docs/:slug
    -- UNIQUE at DB level prevents race conditions on concurrent creates

    content       TEXT        NOT NULL DEFAULT '',
    -- Raw Markdown. No size limit imposed — content can be large.
    -- The application renders it client-side.

    description   TEXT,
    -- Optional one-line summary shown in nav and search results

    tags          TEXT[]      DEFAULT '{}',
    -- PostgreSQL native array — avoids a separate tags junction table
    -- Trade-off: cannot index individual tags efficiently at large scale
    -- Acceptable for MVP; upgrade to junction table if tag filtering becomes critical

    status        TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published')),
    -- CHECK constraint: invalid status rejected at DB level

    parent_id     UUID        REFERENCES documents(id) ON DELETE SET NULL,
    -- Self-referential for hierarchy (adjacency list pattern)
    -- ON DELETE SET NULL: deleting a parent orphans children to root level
    -- Does NOT cascade-delete children — this is intentional

    position      INTEGER     NOT NULL DEFAULT 0,
    -- Sibling ordering within the same parent
    -- Simple integer; upgrade to LexoRank strings if frequent reorders cause gaps

    author_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    published_at  TIMESTAMPTZ,
    -- NULL when draft; set on publish, cleared on unpublish

    search_vector TSVECTOR,
    -- Maintained automatically by trigger (see below)
    -- Never set manually by application code

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `document_versions`

Append-only version history. A snapshot is saved before every PUT request.

```sql
CREATE TABLE document_versions (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    -- Cascade: deleting a document removes all its history

    title       TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    -- Full snapshots — not diffs. Simpler to implement and query.
    -- Trade-off: higher storage. Acceptable for documentation (low write frequency).

    version     INTEGER     NOT NULL,
    -- Monotonically increasing per document (not global)
    -- Application queries MAX(version) + 1 before insert

    author_id   UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- No updated_at — this table is INSERT-only. Rows are never modified.
);
```

**Design principle:** Versions are **immutable**. Once written, they are never updated or deleted (unless the parent document is deleted). This ensures a reliable audit trail.

---

### `refresh_tokens`

Enables server-side session revocation. Access tokens are stateless and cannot be revoked — refresh tokens close that gap.

```sql
CREATE TABLE refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Cascade: deleting a user revokes all their sessions automatically

    token      TEXT        UNIQUE NOT NULL,
    -- Opaque UUID string — NOT a JWT. Cannot be decoded to extract information.
    -- Stored as-is; compared with constant-time equality check.

    expires_at TIMESTAMPTZ NOT NULL,
    -- Application checks this before accepting the token
    -- Expired tokens are cleaned up periodically (or on next use)

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Full-Text Search: Trigger + tsvector

The `search_vector` column is maintained by a PostgreSQL trigger. Application code never touches it directly.

```sql
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title,       '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.content,     '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_search_vector_update
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();
```

**Weight rationale:**

| Weight | Field | Meaning |
|--------|-------|---------|
| `A` | `title` | Highest rank — title match is the strongest signal |
| `B` | `description` | Medium — short summary, curated by author |
| `C` | `content` | Lowest — body text, highest volume, lower signal density |

A document whose title matches the query will rank above one whose body matches, even if the body has more occurrences.

---

## Indexes

```sql
-- Full-text search (primary)
CREATE INDEX idx_documents_search
    ON documents USING GIN(search_vector);
-- GIN (Generalized Inverted Index) is optimal for tsvector queries
-- Much faster than sequential scan for FTS

-- Fuzzy/partial match fallback
CREATE INDEX idx_documents_title_trgm
    ON documents USING GIN(title gin_trgm_ops);
-- Used when FTS returns 0 results (short queries, partial words)
-- Example: searching "auth" finds "authentication"

-- Navigation tree queries
CREATE INDEX idx_documents_parent_id ON documents(parent_id);
-- Used for: SELECT * FROM documents WHERE parent_id = $1

-- Public doc filter (most common query on public routes)
CREATE INDEX idx_documents_status ON documents(status);

-- URL slug lookup
CREATE INDEX idx_documents_slug ON documents(slug);
-- Already covered by UNIQUE constraint but explicit for clarity

-- Ordered siblings query
CREATE INDEX idx_documents_position ON documents(parent_id, position);
-- Composite index: parent_id + position for ORDER BY queries on tree nodes

-- Version history lookup
CREATE INDEX idx_document_versions_doc_id ON document_versions(document_id);

-- Token lookup (O(1) on login/refresh)
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
-- user_id index used by: DELETE FROM refresh_tokens WHERE user_id = $1 (logout)
```

---

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  users                                                               │
│  ────────────────────────────────────────────────────────────────    │
│  id           UUID  PK                                               │
│  email        TEXT  UNIQUE                                           │
│  name         TEXT                                                   │
│  password     TEXT  (bcrypt hash)                                    │
│  role         TEXT  CHECK (admin | editor)                           │
│  created_at   TIMESTAMPTZ                                            │
│  updated_at   TIMESTAMPTZ                                            │
└──────────┬──────────────────────────────────────────────────────────┘
           │ 1                                    │ 1
           │                                      │
           │ N (author_id)             N (user_id)│
           ▼                                      ▼
┌──────────────────────────────┐   ┌─────────────────────────────────┐
│  documents                   │   │  refresh_tokens                  │
│  ──────────────────────────  │   │  ─────────────────────────────   │
│  id            UUID  PK      │   │  id          UUID  PK           │
│  title         TEXT          │   │  user_id     UUID  FK → users   │
│  slug          TEXT  UNIQUE  │   │  token       TEXT  UNIQUE       │
│  content       TEXT          │   │  expires_at  TIMESTAMPTZ        │
│  description   TEXT          │   │  created_at  TIMESTAMPTZ        │
│  tags          TEXT[]        │   └─────────────────────────────────┘
│  status        TEXT  CHECK   │
│  parent_id     UUID  FK ──┐  │   ┌─────────────────────────────────┐
│  position      INTEGER    │  │   │  document_versions               │
│  author_id     UUID  FK   │  │   │  ─────────────────────────────   │
│  published_at  TIMESTAMPTZ│  │   │  id           UUID  PK          │
│  search_vector TSVECTOR   │  │   │  document_id  UUID  FK ←────────┤
│  created_at    TIMESTAMPTZ│  │   │  title        TEXT  (snapshot)  │
│  updated_at    TIMESTAMPTZ│  │   │  content      TEXT  (snapshot)  │
└───────────────────────────┘  │   │  version      INTEGER           │
           ▲    │               │   │  author_id    UUID  FK          │
           │    └──────────────┘   │  created_at   TIMESTAMPTZ       │
           │  self-ref (parent_id) └─────────────────────────────────┘
           │  1 parent : N children
           │  ON DELETE SET NULL
```

---

## Key Design Decisions

### 1. Adjacency List for Hierarchy

**Chosen:** `parent_id UUID REFERENCES documents(id) ON DELETE SET NULL`

```
Alternative A: Nested Sets (lft/rgt)
  + Very fast subtree reads
  - Expensive inserts/moves (rewrite lft/rgt for whole tree)
  - Complex to maintain correctly

Alternative B: Materialized Path (path TEXT like '1.4.7')
  + Fast subtree reads, simple moves
  - Requires ltree extension or string parsing

Chosen: Adjacency List
  + Simplest writes (single row INSERT/UPDATE)
  + Natural model that developers immediately understand
  + Unlimited depth
  - Tree assembly is O(n) at read time (done in Go after fetch)
  - No efficient subtree queries without recursive CTE
```

**Verdict:** For documentation platforms (low write frequency, trees with <10,000 nodes), the adjacency list wins on simplicity. The O(n) tree assembly is not a performance concern at this scale.

### 2. Tags as TEXT[] Array

**Chosen:** Native PostgreSQL array column

```
Alternative: Separate tags table + junction table
  + Individually indexable
  + Tag rename propagates automatically
  - 2 extra tables, JOIN on every query
  - Overkill for MVP

Chosen: TEXT[] array
  + Zero extra tables
  + Simple to read/write
  + Can be queried with @> (contains) operator
  - Cannot efficiently index individual tag values at scale
```

### 3. Full Snapshots in Versions (not diffs)

**Chosen:** Store full `title` + `content` in every version row.

```
Alternative: Store diffs (unified diff or JSON patch)
  + Lower storage per version
  - Complex to apply diffs to reconstruct historical state
  - Difficult to search within historical versions

Chosen: Full snapshots
  + Trivial to restore any version (just use the snapshot)
  + Simple to display diffs (compute at read time between two snapshots)
  - Higher storage
```

**Verdict:** Documentation is written infrequently. A 50KB document saved 100 times = 5MB of history. Acceptable storage cost for a massive reduction in complexity.

### 4. TIMESTAMPTZ (not TIMESTAMP)

All timestamps use `TIMESTAMPTZ` (timestamp with time zone). This stores UTC and handles timezone conversion automatically. `TIMESTAMP` without timezone stores a "naive" timestamp that can cause bugs when servers or clients change timezones.
