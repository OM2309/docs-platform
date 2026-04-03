-- DocFlow Database Schema
-- PostgreSQL 14+ (Neon compatible)
-- Run in order; migrations are embedded in backend/internal/db/db.go

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────────────────────
-- Users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email      TEXT        UNIQUE NOT NULL,
    name       TEXT        NOT NULL,
    password   TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT 'editor'
                           CHECK (role IN ('admin', 'editor')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Documents
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    title         TEXT        NOT NULL,
    slug          TEXT        UNIQUE NOT NULL,
    content       TEXT        NOT NULL DEFAULT '',
    description   TEXT,
    tags          TEXT[]      DEFAULT '{}',
    status        TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published')),
    parent_id     UUID        REFERENCES documents(id) ON DELETE SET NULL,
    position      INTEGER     NOT NULL DEFAULT 0,
    author_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    published_at  TIMESTAMPTZ,
    search_vector TSVECTOR,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Document Versions (append-only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_versions (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    title       TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    version     INTEGER     NOT NULL,
    author_id   UUID        NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Refresh Tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT        UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Full-Text Search Trigger
-- ─────────────────────────────────────────────────────────────────────────────
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

DROP TRIGGER IF EXISTS documents_search_vector_update ON documents;
CREATE TRIGGER documents_search_vector_update
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_search
    ON documents USING GIN(search_vector);

CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
    ON documents USING GIN(title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_parent_id
    ON documents(parent_id);

CREATE INDEX IF NOT EXISTS idx_documents_status
    ON documents(status);

CREATE INDEX IF NOT EXISTS idx_documents_slug
    ON documents(slug);

CREATE INDEX IF NOT EXISTS idx_documents_position
    ON documents(parent_id, position);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc_id
    ON document_versions(document_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token
    ON refresh_tokens(token);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
    ON refresh_tokens(user_id);
