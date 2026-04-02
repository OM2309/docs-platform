package middleware

import (
	"net/http"
	"strings"

	"docflow/internal/auth"
	"docflow/internal/models"

	"github.com/gin-gonic/gin"
)

const UserContextKey = "user"

// RequireAuth validates the Bearer JWT and injects the user into context
func RequireAuth(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: "authorization header required",
				Code:  "AUTH_MISSING",
			})
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: "invalid authorization format, expected: Bearer <token>",
				Code:  "AUTH_INVALID_FORMAT",
			})
			return
		}

		claims, err := auth.ValidateAccessToken(parts[1], jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, models.ErrorResponse{
				Error: "invalid or expired token",
				Code:  "AUTH_TOKEN_INVALID",
			})
			return
		}

		c.Set(UserContextKey, claims)
		c.Next()
	}
}

// RequireAdmin ensures the user has admin role
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, exists := c.Get(UserContextKey)
		if !exists {
			c.AbortWithStatusJSON(http.StatusForbidden, models.ErrorResponse{
				Error: "forbidden",
				Code:  "AUTH_FORBIDDEN",
			})
			return
		}

		userClaims, ok := claims.(*auth.Claims)
		if !ok || userClaims.Role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, models.ErrorResponse{
				Error: "admin role required",
				Code:  "AUTH_ADMIN_REQUIRED",
			})
			return
		}

		c.Next()
	}
}

// GetUserClaims extracts claims from gin context (safe helper)
func GetUserClaims(c *gin.Context) (*auth.Claims, bool) {
	val, exists := c.Get(UserContextKey)
	if !exists {
		return nil, false
	}
	claims, ok := val.(*auth.Claims)
	return claims, ok
}
