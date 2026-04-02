package handlers

import (
	"net/http"
	"strings"

	"docflow/internal/models"
	"docflow/internal/repository"

	"github.com/gin-gonic/gin"
)

type PublicHandler struct {
	repo *repository.Repository
}

func NewPublicHandler(repo *repository.Repository) *PublicHandler {
	return &PublicHandler{repo: repo}
}

// ListDocs godoc
// GET /api/v1/public/docs
// Returns all published documents (flattened, lightweight)
func (h *PublicHandler) ListDocs(c *gin.Context) {
	docs, err := h.repo.ListPublishedDocuments(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch documents"})
		return
	}

	if docs == nil {
		docs = []*models.Document{}
	}

	// Strip content for list view, return metadata only
	type DocMeta struct {
		ID          string  `json:"id"`
		Title       string  `json:"title"`
		Slug        string  `json:"slug"`
		Description *string `json:"description"`
		Tags        []string `json:"tags"`
		ParentID    *string `json:"parent_id"`
		Position    int     `json:"position"`
	}

	metas := make([]DocMeta, len(docs))
	for i, d := range docs {
		metas[i] = DocMeta{
			ID:          d.ID,
			Title:       d.Title,
			Slug:        d.Slug,
			Description: d.Description,
			Tags:        d.Tags,
			ParentID:    d.ParentID,
			Position:    d.Position,
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": metas, "total": len(metas)})
}

// GetDoc godoc
// GET /api/v1/public/docs/:slug
// Returns a single published document with full content
func (h *PublicHandler) GetDoc(c *gin.Context) {
	slug := c.Param("slug")
	if slug == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "slug is required"})
		return
	}

	doc, err := h.repo.GetPublishedDocumentBySlug(c, slug)
	if err == repository.ErrNotFound {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error: "document not found",
			Code:  "DOC_NOT_FOUND",
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch document"})
		return
	}

	c.JSON(http.StatusOK, doc)
}

// GetNavigation godoc
// GET /api/v1/public/nav
// Returns hierarchical navigation tree of published docs
func (h *PublicHandler) GetNavigation(c *gin.Context) {
	docs, err := h.repo.ListPublishedDocuments(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch navigation"})
		return
	}

	tree := buildNavTree(docs)
	c.JSON(http.StatusOK, gin.H{"nav": tree})
}

// Search godoc
// GET /api/v1/public/search?q=<query>&limit=<n>
func (h *PublicHandler) Search(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: "query parameter 'q' is required",
		})
		return
	}

	if len(q) < 2 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error: "query must be at least 2 characters",
		})
		return
	}

	limit := 20
	results, err := h.repo.SearchPublished(c, q, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "search failed"})
		return
	}

	if results == nil {
		results = []*models.SearchResult{}
	}

	c.JSON(http.StatusOK, gin.H{
		"query":   q,
		"results": results,
		"total":   len(results),
	})
}

// ─── Navigation tree builder ──────────────────────────────────────────

func buildNavTree(docs []*models.Document) []*models.NavItem {
	// Index all items
	index := make(map[string]*models.NavItem, len(docs))
	for _, d := range docs {
		index[d.ID] = &models.NavItem{
			ID:       d.ID,
			Title:    d.Title,
			Slug:     d.Slug,
			Position: d.Position,
		}
	}

	// Build tree
	var roots []*models.NavItem
	for _, d := range docs {
		item := index[d.ID]
		if d.ParentID == nil {
			roots = append(roots, item)
		} else {
			if parent, ok := index[*d.ParentID]; ok {
				parent.Children = append(parent.Children, item)
			} else {
				// Orphaned node (parent not published) → treat as root
				roots = append(roots, item)
			}
		}
	}

	// Sort by position
	sortNavItems(roots)
	return roots
}

func sortNavItems(items []*models.NavItem) {
	// Simple insertion sort (docs are usually small)
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j].Position < items[j-1].Position; j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
		sortNavItems(items[i].Children)
	}
}
