package handlers

import (
	"net/http"
	"strconv"

	"docflow/internal/config"
	"docflow/internal/middleware"
	"docflow/internal/models"
	"docflow/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AdminHandler struct {
	repo *repository.Repository
	cfg  *config.Config
}

func NewAdminHandler(repo *repository.Repository, cfg *config.Config) *AdminHandler {
	return &AdminHandler{repo: repo, cfg: cfg}
}

// ListDocs godoc
// GET /api/v1/admin/docs?page=1&page_size=20&status=draft|published
func (h *AdminHandler) ListDocs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	docs, total, err := h.repo.ListDocuments(c, page, pageSize, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to list documents"})
		return
	}

	if docs == nil {
		docs = []*models.Document{}
	}

	c.JSON(http.StatusOK, models.ListDocsResponse{
		Data:     docs,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}

// CreateDoc godoc
// POST /api/v1/admin/docs
func (h *AdminHandler) CreateDoc(c *gin.Context) {
	claims, ok := middleware.GetUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "unauthorized"})
		return
	}

	var req models.CreateDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid request body",
			Details: err.Error(),
		})
		return
	}

	// Validate slug uniqueness
	exists, err := h.repo.SlugExists(c, req.Slug, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "slug validation failed"})
		return
	}
	if exists {
		c.JSON(http.StatusConflict, models.ErrorResponse{
			Error: "slug already exists, choose a different one",
			Code:  "SLUG_TAKEN",
		})
		return
	}

	if req.Tags == nil {
		req.Tags = []string{}
	}

	doc := &models.Document{
		ID:          uuid.New().String(),
		Title:       req.Title,
		Slug:        req.Slug,
		Content:     req.Content,
		Description: req.Description,
		Tags:        req.Tags,
		Status:      models.StatusDraft,
		ParentID:    req.ParentID,
		Position:    req.Position,
		AuthorID:    claims.UserID,
	}

	if err := h.repo.CreateDocument(c, doc); err != nil {
		if err == repository.ErrConflict {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error: "slug already exists",
				Code:  "SLUG_TAKEN",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create document"})
		return
	}

	c.JSON(http.StatusCreated, doc)
}

// GetDoc godoc
// GET /api/v1/admin/docs/:id
func (h *AdminHandler) GetDoc(c *gin.Context) {
	id := c.Param("id")
	doc, err := h.repo.GetDocumentByID(c, id)
	if err == repository.ErrNotFound {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "document not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch document"})
		return
	}

	c.JSON(http.StatusOK, doc)
}

// UpdateDoc godoc
// PUT /api/v1/admin/docs/:id
func (h *AdminHandler) UpdateDoc(c *gin.Context) {
	claims, ok := middleware.GetUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "unauthorized"})
		return
	}

	id := c.Param("id")

	// Fetch existing for version snapshot
	current, err := h.repo.GetDocumentByID(c, id)
	if err == repository.ErrNotFound {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "document not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "fetch failed"})
		return
	}

	var req models.UpdateDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid request body",
			Details: err.Error(),
		})
		return
	}

	// Validate slug uniqueness if changing
	if req.Slug != nil && *req.Slug != current.Slug {
		exists, err := h.repo.SlugExists(c, *req.Slug, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "slug validation failed"})
			return
		}
		if exists {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error: "slug already taken",
				Code:  "SLUG_TAKEN",
			})
			return
		}
	}

	// Save version snapshot before updating
	nextVer, _ := h.repo.GetNextVersion(c, id)
	_ = h.repo.CreateVersion(c, &models.DocumentVersion{
		ID:         uuid.New().String(),
		DocumentID: id,
		Title:      current.Title,
		Content:    current.Content,
		Version:    nextVer,
		AuthorID:   claims.UserID,
	})

	updated, err := h.repo.UpdateDocument(c, id, &req)
	if err == repository.ErrConflict {
		c.JSON(http.StatusConflict, models.ErrorResponse{Error: "slug already taken"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "update failed"})
		return
	}

	c.JSON(http.StatusOK, updated)
}

// DeleteDoc godoc
// DELETE /api/v1/admin/docs/:id
func (h *AdminHandler) DeleteDoc(c *gin.Context) {
	id := c.Param("id")

	if err := h.repo.DeleteDocument(c, id); err == repository.ErrNotFound {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "document not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "delete failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "document deleted"})
}

// PublishDoc godoc
// PATCH /api/v1/admin/docs/:id/publish
func (h *AdminHandler) PublishDoc(c *gin.Context) {
	id := c.Param("id")

	if err := h.repo.PublishDocument(c, id); err == repository.ErrNotFound {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "document not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "publish failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "document published"})
}

// UnpublishDoc godoc
// PATCH /api/v1/admin/docs/:id/unpublish
func (h *AdminHandler) UnpublishDoc(c *gin.Context) {
	id := c.Param("id")

	if err := h.repo.UnpublishDocument(c, id); err == repository.ErrNotFound {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "document not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "unpublish failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "document unpublished"})
}

// MoveDoc godoc
// PATCH /api/v1/admin/docs/:id/move
func (h *AdminHandler) MoveDoc(c *gin.Context) {
	id := c.Param("id")

	var req models.MoveDocRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "invalid request"})
		return
	}

	if err := h.repo.MoveDocument(c, id, &req); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "move failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "document moved"})
}

// GetVersions godoc
// GET /api/v1/admin/docs/:id/versions
func (h *AdminHandler) GetVersions(c *gin.Context) {
	id := c.Param("id")

	versions, err := h.repo.GetVersions(c, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch versions"})
		return
	}

	if versions == nil {
		versions = []*models.DocumentVersion{}
	}

	c.JSON(http.StatusOK, gin.H{"versions": versions, "total": len(versions)})
}

// ReindexSearch godoc
// POST /api/v1/admin/search/reindex
func (h *AdminHandler) ReindexSearch(c *gin.Context) {
	if err := h.repo.ReindexAll(c); err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "reindex failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "search index rebuilt"})
}

// GetStats godoc
// GET /api/v1/admin/stats
func (h *AdminHandler) GetStats(c *gin.Context) {
	stats, err := h.repo.GetStats(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to fetch stats"})
		return
	}

	c.JSON(http.StatusOK, stats)
}
