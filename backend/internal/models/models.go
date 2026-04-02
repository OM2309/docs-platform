package models

import (
	"time"
)

// User represents an authenticated admin/editor
type User struct {
	ID        string    `json:"id" db:"id"`
	Email     string    `json:"email" db:"email"`
	Name      string    `json:"name" db:"name"`
	Password  string    `json:"-" db:"password"`
	Role      string    `json:"role" db:"role"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// DocumentStatus represents the publication state
type DocumentStatus string

const (
	StatusDraft     DocumentStatus = "draft"
	StatusPublished DocumentStatus = "published"
)

// Document is the core content entity
type Document struct {
	ID          string         `json:"id" db:"id"`
	Title       string         `json:"title" db:"title"`
	Slug        string         `json:"slug" db:"slug"`
	Content     string         `json:"content" db:"content"`
	Description *string        `json:"description" db:"description"`
	Tags        []string       `json:"tags" db:"tags"`
	Status      DocumentStatus `json:"status" db:"status"`
	ParentID    *string        `json:"parent_id" db:"parent_id"`
	Position    int            `json:"position" db:"position"`
	AuthorID    string         `json:"author_id" db:"author_id"`
	PublishedAt *time.Time     `json:"published_at" db:"published_at"`
	CreatedAt   time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at" db:"updated_at"`

	// Enriched fields (joined)
	AuthorName  *string     `json:"author_name,omitempty" db:"author_name"`
	Children    []*Document `json:"children,omitempty" db:"-"`
}

// DocumentVersion stores historical snapshots
type DocumentVersion struct {
	ID         string    `json:"id" db:"id"`
	DocumentID string    `json:"document_id" db:"document_id"`
	Title      string    `json:"title" db:"title"`
	Content    string    `json:"content" db:"content"`
	Version    int       `json:"version" db:"version"`
	AuthorID   string    `json:"author_id" db:"author_id"`
	AuthorName string    `json:"author_name" db:"author_name"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

// NavItem is a lightweight tree node for sidebar navigation
type NavItem struct {
	ID       string     `json:"id"`
	Title    string     `json:"title"`
	Slug     string     `json:"slug"`
	Position int        `json:"position"`
	Children []*NavItem `json:"children,omitempty"`
}

// SearchResult is returned from FTS queries
type SearchResult struct {
	ID          string  `json:"id" db:"id"`
	Title       string  `json:"title" db:"title"`
	Slug        string  `json:"slug" db:"slug"`
	Snippet     string  `json:"snippet" db:"snippet"`
	Rank        float64 `json:"rank" db:"rank"`
	Description *string `json:"description" db:"description"`
}

// RefreshToken stored in DB for logout/rotation
type RefreshToken struct {
	ID        string    `json:"id" db:"id"`
	UserID    string    `json:"user_id" db:"user_id"`
	Token     string    `json:"token" db:"token"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// Stats for admin dashboard
type Stats struct {
	TotalDocs     int `json:"total_docs"`
	PublishedDocs int `json:"published_docs"`
	DraftDocs     int `json:"draft_docs"`
	TotalUsers    int `json:"total_users"`
}

// ─── Request/Response DTOs ───────────────────────────────────────────

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Name     string `json:"name" binding:"required,min=2"`
	Password string `json:"password" binding:"required,min=8"`
	Role     string `json:"role" binding:"omitempty,oneof=admin editor"`
}

type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         *User  `json:"user"`
}

type CreateDocRequest struct {
	Title       string   `json:"title" binding:"required,min=1"`
	Slug        string   `json:"slug" binding:"required"`
	Content     string   `json:"content"`
	Description *string  `json:"description"`
	Tags        []string `json:"tags"`
	ParentID    *string  `json:"parent_id"`
	Position    int      `json:"position"`
}

type UpdateDocRequest struct {
	Title       *string  `json:"title"`
	Slug        *string  `json:"slug"`
	Content     *string  `json:"content"`
	Description *string  `json:"description"`
	Tags        []string `json:"tags"`
	ParentID    *string  `json:"parent_id"`
	Position    *int     `json:"position"`
}

type MoveDocRequest struct {
	ParentID *string `json:"parent_id"`
	Position int     `json:"position"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type ListDocsResponse struct {
	Data       []*Document `json:"data"`
	Total      int         `json:"total"`
	Page       int         `json:"page"`
	PageSize   int         `json:"page_size"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}
