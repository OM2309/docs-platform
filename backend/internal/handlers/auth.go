package handlers

import (
	"net/http"
	"time"

	"docflow/internal/auth"
	"docflow/internal/config"
	"docflow/internal/middleware"
	"docflow/internal/models"
	"docflow/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct {
	repo *repository.Repository
	cfg  *config.Config
}

func NewAuthHandler(repo *repository.Repository, cfg *config.Config) *AuthHandler {
	return &AuthHandler{repo: repo, cfg: cfg}
}

// Register godoc
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid request body",
			Details: err.Error(),
		})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to hash password"})
		return
	}

	role := "editor"
	if req.Role != "" {
		role = req.Role
	}

	user := &models.User{
		ID:       uuid.New().String(),
		Email:    req.Email,
		Name:     req.Name,
		Password: hash,
		Role:     role,
	}

	if err := h.repo.CreateUser(c, user); err != nil {
		if err == repository.ErrConflict {
			c.JSON(http.StatusConflict, models.ErrorResponse{
				Error: "email already registered",
				Code:  "EMAIL_TAKEN",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create user"})
		return
	}

	tokens, err := h.issueTokens(c, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to issue tokens"})
		return
	}

	c.JSON(http.StatusCreated, tokens)
}

// Login godoc
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid request body",
			Details: err.Error(),
		})
		return
	}

	user, err := h.repo.GetUserByEmail(c, req.Email)
	if err == repository.ErrNotFound || !auth.CheckPassword(user.Password, req.Password) {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "invalid email or password",
			Code:  "INVALID_CREDENTIALS",
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "authentication failed"})
		return
	}

	tokens, err := h.issueTokens(c, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to issue tokens"})
		return
	}

	c.JSON(http.StatusOK, tokens)
}

// RefreshToken godoc
// POST /api/v1/auth/refresh
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req models.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "refresh_token required"})
		return
	}

	rt, err := h.repo.GetRefreshToken(c, req.RefreshToken)
	if err == repository.ErrNotFound {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "invalid or expired refresh token",
			Code:  "REFRESH_INVALID",
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "token lookup failed"})
		return
	}

	if rt.ExpiresAt.Before(time.Now()) {
		_ = h.repo.DeleteRefreshToken(c, req.RefreshToken)
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error: "refresh token expired",
			Code:  "REFRESH_EXPIRED",
		})
		return
	}

	user, err := h.repo.GetUserByID(c, rt.UserID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "user not found"})
		return
	}

	// Rotate: delete old, issue new
	_ = h.repo.DeleteRefreshToken(c, req.RefreshToken)

	tokens, err := h.issueTokens(c, user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "failed to issue tokens"})
		return
	}

	c.JSON(http.StatusOK, tokens)
}

// Logout godoc
// POST /api/v1/auth/logout
func (h *AuthHandler) Logout(c *gin.Context) {
	claims, ok := middleware.GetUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "unauthorized"})
		return
	}

	// Invalidate all refresh tokens for this user
	_ = h.repo.DeleteUserRefreshTokens(c, claims.UserID)

	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

// Me godoc
// GET /api/v1/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	claims, ok := middleware.GetUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{Error: "unauthorized"})
		return
	}

	user, err := h.repo.GetUserByID(c, claims.UserID)
	if err != nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "user not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// ─── Private helpers ─────────────────────────────────────────────────

func (h *AuthHandler) issueTokens(c *gin.Context, user *models.User) (*models.AuthResponse, error) {
	accessToken, err := auth.GenerateAccessToken(user.ID, user.Email, user.Role, h.cfg.JWTSecret)
	if err != nil {
		return nil, err
	}

	refreshTokenStr := auth.GenerateRefreshToken()
	rt := &models.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		Token:     refreshTokenStr,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	if err := h.repo.SaveRefreshToken(c, rt); err != nil {
		return nil, err
	}

	return &models.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshTokenStr,
		User:         user,
	}, nil
}
