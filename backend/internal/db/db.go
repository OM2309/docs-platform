package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool creates a new PostgreSQL connection pool
func NewPool(dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parsing db config: %w", err)
	}

	cfg.MaxConns = 25
	cfg.MinConns = 5
	cfg.MaxConnLifetime = 1 * time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("creating pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	return pool, nil
}

// RunMigrations executes all schema migrations in order
func RunMigrations(pool *pgxpool.Pool) error {
	ctx := context.Background()

	migrations := []string{
		migrationEnableExtensions,
		migrationCreateUsers,
		migrationCreateDocuments,
		migrationCreateDocumentVersions,
		migrationCreateRefreshTokens,
		migrationCreateSearchIndex,
		migrationCreateIndexes,
	}

	for i, m := range migrations {
		if _, err := pool.Exec(ctx, m); err != nil {
			return fmt.Errorf("migration %d failed: %w", i+1, err)
		}
	}

	return nil
}

const migrationEnableExtensions = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
`

const migrationCreateUsers = `
CREATE TABLE IF NOT EXISTS users (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	email       TEXT UNIQUE NOT NULL,
	name        TEXT NOT NULL,
	password    TEXT NOT NULL,
	role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

const migrationCreateDocuments = `
CREATE TABLE IF NOT EXISTS documents (
	id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	title         TEXT NOT NULL,
	slug          TEXT UNIQUE NOT NULL,
	content       TEXT NOT NULL DEFAULT '',
	description   TEXT,
	tags          TEXT[] DEFAULT '{}',
	status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
	parent_id     UUID REFERENCES documents(id) ON DELETE SET NULL,
	position      INTEGER NOT NULL DEFAULT 0,
	author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	published_at  TIMESTAMPTZ,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

const migrationCreateDocumentVersions = `
CREATE TABLE IF NOT EXISTS document_versions (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
	title       TEXT NOT NULL,
	content     TEXT NOT NULL,
	version     INTEGER NOT NULL,
	author_id   UUID NOT NULL REFERENCES users(id),
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

const migrationCreateRefreshTokens = `
CREATE TABLE IF NOT EXISTS refresh_tokens (
	id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
	user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token       TEXT UNIQUE NOT NULL,
	expires_at  TIMESTAMPTZ NOT NULL,
	created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`

const migrationCreateSearchIndex = `
-- Full-text search using PostgreSQL tsvector
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Update search vector on insert/update
CREATE OR REPLACE FUNCTION update_search_vector()
RETURNS TRIGGER AS $$
BEGIN
	NEW.search_vector :=
		setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
		setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
		setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C');
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS documents_search_vector_update ON documents;
CREATE TRIGGER documents_search_vector_update
	BEFORE INSERT OR UPDATE ON documents
	FOR EACH ROW EXECUTE FUNCTION update_search_vector();
`

const migrationCreateIndexes = `
-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING GIN(search_vector);

-- Trigram index for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON documents USING GIN(title gin_trgm_ops);

-- Hierarchy queries
CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
CREATE INDEX IF NOT EXISTS idx_documents_position ON documents(parent_id, position);

-- Refresh tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Versions
CREATE INDEX IF NOT EXISTS idx_document_versions_doc_id ON document_versions(document_id);
`
