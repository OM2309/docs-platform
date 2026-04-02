package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"docflow/internal/models"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a record doesn't exist
var ErrNotFound = errors.New("record not found")

// ErrConflict is returned on unique constraint violations
var ErrConflict = errors.New("record already exists")

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// ─── User Repository ─────────────────────────────────────────────────

func (r *Repository) CreateUser(ctx context.Context, user *models.User) error {
	q := `
		INSERT INTO users (id, email, name, password, role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at, updated_at
	`
	err := r.pool.QueryRow(ctx, q,
		user.ID, user.Email, user.Name, user.Password, user.Role,
	).Scan(&user.CreatedAt, &user.UpdatedAt)

	if err != nil && isUniqueViolation(err) {
		return ErrConflict
	}
	return err
}

func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	q := `SELECT id, email, name, password, role, created_at, updated_at FROM users WHERE email = $1`
	user := &models.User{}
	err := r.pool.QueryRow(ctx, q, email).Scan(
		&user.ID, &user.Email, &user.Name, &user.Password, &user.Role,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return user, err
}

func (r *Repository) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	q := `SELECT id, email, name, password, role, created_at, updated_at FROM users WHERE id = $1`
	user := &models.User{}
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&user.ID, &user.Email, &user.Name, &user.Password, &user.Role,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return user, err
}

func (r *Repository) CountUsers(ctx context.Context) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

// ─── Refresh Token Repository ─────────────────────────────────────────

func (r *Repository) SaveRefreshToken(ctx context.Context, rt *models.RefreshToken) error {
	q := `
		INSERT INTO refresh_tokens (id, user_id, token, expires_at)
		VALUES ($1, $2, $3, $4)
	`
	_, err := r.pool.Exec(ctx, q, rt.ID, rt.UserID, rt.Token, rt.ExpiresAt)
	return err
}

func (r *Repository) GetRefreshToken(ctx context.Context, token string) (*models.RefreshToken, error) {
	q := `SELECT id, user_id, token, expires_at, created_at FROM refresh_tokens WHERE token = $1`
	rt := &models.RefreshToken{}
	err := r.pool.QueryRow(ctx, q, token).Scan(
		&rt.ID, &rt.UserID, &rt.Token, &rt.ExpiresAt, &rt.CreatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return rt, err
}

func (r *Repository) DeleteRefreshToken(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE token = $1`, token)
	return err
}

func (r *Repository) DeleteUserRefreshTokens(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID)
	return err
}

// ─── Document Repository ─────────────────────────────────────────────

func (r *Repository) CreateDocument(ctx context.Context, doc *models.Document) error {
	q := `
		INSERT INTO documents (id, title, slug, content, description, tags, status, parent_id, position, author_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at, updated_at
	`
	err := r.pool.QueryRow(ctx, q,
		doc.ID, doc.Title, doc.Slug, doc.Content,
		doc.Description, doc.Tags, doc.Status,
		doc.ParentID, doc.Position, doc.AuthorID,
	).Scan(&doc.CreatedAt, &doc.UpdatedAt)

	if err != nil && isUniqueViolation(err) {
		return ErrConflict
	}
	return err
}

func (r *Repository) GetDocumentByID(ctx context.Context, id string) (*models.Document, error) {
	q := `
		SELECT d.id, d.title, d.slug, d.content, d.description, d.tags,
			d.status, d.parent_id, d.position, d.author_id,
			d.published_at, d.created_at, d.updated_at,
			u.name as author_name
		FROM documents d
		LEFT JOIN users u ON u.id = d.author_id
		WHERE d.id = $1
	`
	return r.scanDocument(r.pool.QueryRow(ctx, q, id))
}

func (r *Repository) GetDocumentBySlug(ctx context.Context, slug string) (*models.Document, error) {
	q := `
		SELECT d.id, d.title, d.slug, d.content, d.description, d.tags,
			d.status, d.parent_id, d.position, d.author_id,
			d.published_at, d.created_at, d.updated_at,
			u.name as author_name
		FROM documents d
		LEFT JOIN users u ON u.id = d.author_id
		WHERE d.slug = $1
	`
	return r.scanDocument(r.pool.QueryRow(ctx, q, slug))
}

func (r *Repository) GetPublishedDocumentBySlug(ctx context.Context, slug string) (*models.Document, error) {
	q := `
		SELECT d.id, d.title, d.slug, d.content, d.description, d.tags,
			d.status, d.parent_id, d.position, d.author_id,
			d.published_at, d.created_at, d.updated_at,
			u.name as author_name
		FROM documents d
		LEFT JOIN users u ON u.id = d.author_id
		WHERE d.slug = $1 AND d.status = 'published'
	`
	return r.scanDocument(r.pool.QueryRow(ctx, q, slug))
}

func (r *Repository) ListDocuments(ctx context.Context, page, pageSize int, statusFilter string) ([]*models.Document, int, error) {
	offset := (page - 1) * pageSize

	var (
		q     string
		args  []interface{}
		cntQ  string
		cntArgs []interface{}
	)

	if statusFilter != "" {
		q = `
			SELECT d.id, d.title, d.slug, d.content, d.description, d.tags,
				d.status, d.parent_id, d.position, d.author_id,
				d.published_at, d.created_at, d.updated_at,
				u.name as author_name
			FROM documents d
			LEFT JOIN users u ON u.id = d.author_id
			WHERE d.status = $1
			ORDER BY d.position ASC, d.created_at DESC
			LIMIT $2 OFFSET $3
		`
		args = []interface{}{statusFilter, pageSize, offset}
		cntQ = `SELECT COUNT(*) FROM documents WHERE status = $1`
		cntArgs = []interface{}{statusFilter}
	} else {
		q = `
			SELECT d.id, d.title, d.slug, d.content, d.description, d.tags,
				d.status, d.parent_id, d.position, d.author_id,
				d.published_at, d.created_at, d.updated_at,
				u.name as author_name
			FROM documents d
			LEFT JOIN users u ON u.id = d.author_id
			ORDER BY d.position ASC, d.created_at DESC
			LIMIT $1 OFFSET $2
		`
		args = []interface{}{pageSize, offset}
		cntQ = `SELECT COUNT(*) FROM documents`
		cntArgs = nil
	}

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list documents: %w", err)
	}
	defer rows.Close()

	var docs []*models.Document
	for rows.Next() {
		doc := &models.Document{}
		if err := scanDocumentRow(rows, doc); err != nil {
			return nil, 0, err
		}
		docs = append(docs, doc)
	}

	var total int
	err = r.pool.QueryRow(ctx, cntQ, cntArgs...).Scan(&total)
	return docs, total, err
}

func (r *Repository) ListPublishedDocuments(ctx context.Context) ([]*models.Document, error) {
	q := `
		SELECT id, title, slug, content, description, tags, status, parent_id,
			position, author_id, published_at, created_at, updated_at,
			NULL::text as author_name
		FROM documents
		WHERE status = 'published'
		ORDER BY position ASC, title ASC
	`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docs []*models.Document
	for rows.Next() {
		doc := &models.Document{}
		if err := scanDocumentRow(rows, doc); err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, nil
}

func (r *Repository) UpdateDocument(ctx context.Context, id string, req *models.UpdateDocRequest) (*models.Document, error) {
	// Fetch current to snapshot and apply partial updates
	current, err := r.GetDocumentByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Title != nil {
		current.Title = *req.Title
	}
	if req.Slug != nil {
		current.Slug = *req.Slug
	}
	if req.Content != nil {
		current.Content = *req.Content
	}
	if req.Description != nil {
		current.Description = req.Description
	}
	if req.Tags != nil {
		current.Tags = req.Tags
	}
	if req.ParentID != nil {
		current.ParentID = req.ParentID
	}
	if req.Position != nil {
		current.Position = *req.Position
	}

	q := `
		UPDATE documents
		SET title=$1, slug=$2, content=$3, description=$4, tags=$5,
			parent_id=$6, position=$7, updated_at=NOW()
		WHERE id=$8
		RETURNING updated_at
	`
	err = r.pool.QueryRow(ctx, q,
		current.Title, current.Slug, current.Content,
		current.Description, current.Tags, current.ParentID,
		current.Position, id,
	).Scan(&current.UpdatedAt)

	if err != nil && isUniqueViolation(err) {
		return nil, ErrConflict
	}
	return current, err
}

func (r *Repository) PublishDocument(ctx context.Context, id string) error {
	q := `UPDATE documents SET status='published', published_at=NOW(), updated_at=NOW() WHERE id=$1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) UnpublishDocument(ctx context.Context, id string) error {
	q := `UPDATE documents SET status='draft', published_at=NULL, updated_at=NOW() WHERE id=$1`
	tag, err := r.pool.Exec(ctx, q, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) MoveDocument(ctx context.Context, id string, req *models.MoveDocRequest) error {
	q := `UPDATE documents SET parent_id=$1, position=$2, updated_at=NOW() WHERE id=$3`
	_, err := r.pool.Exec(ctx, q, req.ParentID, req.Position, id)
	return err
}

func (r *Repository) DeleteDocument(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM documents WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) SlugExists(ctx context.Context, slug, excludeID string) (bool, error) {
	var exists bool
	var err error
	if excludeID != "" {
		err = r.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM documents WHERE slug=$1 AND id != $2)`,
			slug, excludeID,
		).Scan(&exists)
	} else {
		err = r.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM documents WHERE slug=$1)`,
			slug,
		).Scan(&exists)
	}
	return exists, err
}

// ─── Document Versions ────────────────────────────────────────────────

func (r *Repository) CreateVersion(ctx context.Context, v *models.DocumentVersion) error {
	q := `
		INSERT INTO document_versions (id, document_id, title, content, version, author_id)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := r.pool.Exec(ctx, q, v.ID, v.DocumentID, v.Title, v.Content, v.Version, v.AuthorID)
	return err
}

func (r *Repository) GetVersions(ctx context.Context, docID string) ([]*models.DocumentVersion, error) {
	q := `
		SELECT dv.id, dv.document_id, dv.title, dv.content, dv.version, dv.author_id,
			u.name as author_name, dv.created_at
		FROM document_versions dv
		LEFT JOIN users u ON u.id = dv.author_id
		WHERE dv.document_id = $1
		ORDER BY dv.version DESC
	`
	rows, err := r.pool.Query(ctx, q, docID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var versions []*models.DocumentVersion
	for rows.Next() {
		v := &models.DocumentVersion{}
		if err := rows.Scan(&v.ID, &v.DocumentID, &v.Title, &v.Content,
			&v.Version, &v.AuthorID, &v.AuthorName, &v.CreatedAt); err != nil {
			return nil, err
		}
		versions = append(versions, v)
	}
	return versions, nil
}

func (r *Repository) GetNextVersion(ctx context.Context, docID string) (int, error) {
	var max int
	err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM document_versions WHERE document_id=$1`,
		docID,
	).Scan(&max)
	return max + 1, err
}

// ─── Search ──────────────────────────────────────────────────────────

func (r *Repository) SearchPublished(ctx context.Context, query string, limit int) ([]*models.SearchResult, error) {
	q := `
		SELECT 
			id,
			title,
			slug,
			ts_headline('english', content,
				plainto_tsquery('english', $1),
				'MaxWords=30, MinWords=15, StartSel=<mark>, StopSel=</mark>, HighlightAll=false'
			) AS snippet,
			ts_rank_cd(search_vector, plainto_tsquery('english', $1)) AS rank,
			description
		FROM documents
		WHERE 
			status = 'published'
			AND search_vector @@ plainto_tsquery('english', $1)
		ORDER BY rank DESC
		LIMIT $2
	`
	rows, err := r.pool.Query(ctx, q, query, limit)
	if err != nil {
		return nil, fmt.Errorf("search: %w", err)
	}
	defer rows.Close()

	var results []*models.SearchResult
	for rows.Next() {
		sr := &models.SearchResult{}
		if err := rows.Scan(&sr.ID, &sr.Title, &sr.Slug, &sr.Snippet, &sr.Rank, &sr.Description); err != nil {
			return nil, err
		}
		results = append(results, sr)
	}

	// Fallback: trigram similarity if no FTS results
	if len(results) == 0 {
		return r.searchFallback(ctx, query, limit)
	}

	return results, nil
}

func (r *Repository) searchFallback(ctx context.Context, query string, limit int) ([]*models.SearchResult, error) {
	q := `
		SELECT id, title, slug,
			COALESCE(description, LEFT(content, 150)) AS snippet,
			similarity(title, $1) AS rank,
			description
		FROM documents
		WHERE status = 'published'
			AND (title ILIKE '%' || $1 || '%' OR content ILIKE '%' || $1 || '%')
		ORDER BY rank DESC
		LIMIT $2
	`
	rows, err := r.pool.Query(ctx, q, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.SearchResult
	for rows.Next() {
		sr := &models.SearchResult{}
		if err := rows.Scan(&sr.ID, &sr.Title, &sr.Slug, &sr.Snippet, &sr.Rank, &sr.Description); err != nil {
			return nil, err
		}
		results = append(results, sr)
	}
	return results, nil
}

// ─── Stats ───────────────────────────────────────────────────────────

func (r *Repository) GetStats(ctx context.Context) (*models.Stats, error) {
	s := &models.Stats{}
	err := r.pool.QueryRow(ctx, `
		SELECT
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status='published') as published,
			COUNT(*) FILTER (WHERE status='draft') as draft
		FROM documents
	`).Scan(&s.TotalDocs, &s.PublishedDocs, &s.DraftDocs)
	if err != nil {
		return nil, err
	}
	err = r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&s.TotalUsers)
	return s, err
}

// ─── Helpers ─────────────────────────────────────────────────────────

func (r *Repository) scanDocument(row pgx.Row) (*models.Document, error) {
	doc := &models.Document{}
	err := row.Scan(
		&doc.ID, &doc.Title, &doc.Slug, &doc.Content,
		&doc.Description, &doc.Tags, &doc.Status,
		&doc.ParentID, &doc.Position, &doc.AuthorID,
		&doc.PublishedAt, &doc.CreatedAt, &doc.UpdatedAt,
		&doc.AuthorName,
	)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return doc, err
}

func scanDocumentRow(rows pgx.Rows, doc *models.Document) error {
	return rows.Scan(
		&doc.ID, &doc.Title, &doc.Slug, &doc.Content,
		&doc.Description, &doc.Tags, &doc.Status,
		&doc.ParentID, &doc.Position, &doc.AuthorID,
		&doc.PublishedAt, &doc.CreatedAt, &doc.UpdatedAt,
		&doc.AuthorName,
	)
}

func isUniqueViolation(err error) bool {
	return err != nil && (fmt.Sprintf("%v", err) == "ERROR: duplicate key value violates unique constraint" ||
		contains(err.Error(), "23505") ||
		contains(err.Error(), "unique"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 &&
		func() bool {
			for i := 0; i <= len(s)-len(substr); i++ {
				if s[i:i+len(substr)] == substr {
					return true
				}
			}
			return false
		}())
}

// ReindexAll rebuilds search vectors for all documents
func (r *Repository) ReindexAll(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE documents SET updated_at = updated_at
	`) // Triggers the tsvector update function
	return err
}

// GetLastRefreshTokenExpiry returns expiry for a user's tokens
func (r *Repository) CleanExpiredTokens(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE expires_at < NOW()`)
	return err
}

// GetCurrentTime from DB (useful for token expiry checks)
func (r *Repository) DBNow(ctx context.Context) (time.Time, error) {
	var t time.Time
	err := r.pool.QueryRow(ctx, `SELECT NOW()`).Scan(&t)
	return t, err
}
