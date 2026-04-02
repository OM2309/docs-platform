package config

import (
	"os"
	"strings"
)

type Config struct {
	Port           string
	Environment    string
	DatabaseURL    string
	JWTSecret      string
	JWTExpiry      string
	RefreshExpiry  string
	AllowedOrigins []string
}

func New() *Config {
	return &Config{
		Port:          getEnv("PORT", "8080"),
		Environment:   getEnv("ENVIRONMENT", "development"),
		DatabaseURL:   mustGetEnv("DATABASE_URL"),
		JWTSecret:     mustGetEnv("JWT_SECRET"),
		JWTExpiry:     getEnv("JWT_EXPIRY", "15m"),
		RefreshExpiry: getEnv("REFRESH_EXPIRY", "7d"),
		AllowedOrigins: strings.Split(
			getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),
			",",
		),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic("required environment variable not set: " + key)
	}
	return v
}
