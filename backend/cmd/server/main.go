package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"docflow/internal/config"
	"docflow/internal/db"
	"docflow/internal/handlers"
	"docflow/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	cfg := config.New()

	// Initialize database connection pool
	pool, err := db.NewPool(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Run migrations
	if err := db.RunMigrations(pool); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// CORS configuration
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.AllowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "docflow-api"})
	})

	// Initialize handler dependencies
	h := handlers.New(pool, cfg)

	// API v1 routes
	v1 := r.Group("/api/v1")
	{
		// Auth routes (public)
		auth := v1.Group("/auth")
		{
			auth.POST("/login", h.Auth.Login)
			auth.POST("/register", h.Auth.Register)
			auth.POST("/refresh", h.Auth.RefreshToken)
			auth.POST("/logout", middleware.RequireAuth(cfg.JWTSecret), h.Auth.Logout)
			auth.GET("/me", middleware.RequireAuth(cfg.JWTSecret), h.Auth.Me)
		}

		// Public document routes (no auth required)
		public := v1.Group("/public")
		{
			public.GET("/docs", h.Public.ListDocs)
			public.GET("/docs/:slug", h.Public.GetDoc)
			public.GET("/nav", h.Public.GetNavigation)
			public.GET("/search", h.Public.Search)
		}

		// Admin routes (auth required)
		admin := v1.Group("/admin")
		admin.Use(middleware.RequireAuth(cfg.JWTSecret))
		{
			// Document management
			docs := admin.Group("/docs")
			{
				docs.GET("", h.Admin.ListDocs)
				docs.POST("", h.Admin.CreateDoc)
				docs.GET("/:id", h.Admin.GetDoc)
				docs.PUT("/:id", h.Admin.UpdateDoc)
				docs.DELETE("/:id", h.Admin.DeleteDoc)
				docs.PATCH("/:id/publish", h.Admin.PublishDoc)
				docs.PATCH("/:id/unpublish", h.Admin.UnpublishDoc)
				docs.PATCH("/:id/move", h.Admin.MoveDoc)
				docs.GET("/:id/versions", h.Admin.GetVersions)
			}

			// Search management
			admin.POST("/search/reindex", h.Admin.ReindexSearch)

			// Stats
			admin.GET("/stats", h.Admin.GetStats)
		}
	}

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	log.Printf("DocFlow API running on port %s (env: %s)", cfg.Port, cfg.Environment)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server exited")
}
