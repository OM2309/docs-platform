package handlers

import (
	"docflow/internal/config"
	"docflow/internal/repository"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Handlers aggregates all route handler groups
type Handlers struct {
	Auth   *AuthHandler
	Public *PublicHandler
	Admin  *AdminHandler
}

// New wires up all handlers with shared dependencies
func New(pool *pgxpool.Pool, cfg *config.Config) *Handlers {
	repo := repository.New(pool)

	return &Handlers{
		Auth:   NewAuthHandler(repo, cfg),
		Public: NewPublicHandler(repo),
		Admin:  NewAdminHandler(repo, cfg),
	}
}
