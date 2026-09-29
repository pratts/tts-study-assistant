package config

import (
	"errors"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL      string
	JWTSecret        string
	JWTRefreshSecret string
	Port             string
	CORSOrigins      []string
	OpenAIAPIKey     string
	OpenAIModel      string
	OpenAIBaseURL    string
}

// minSecretLen is the minimum JWT secret length (256 bits for HS256).
const minSecretLen = 32

// Load reads configuration from the environment (and .env if present) and
// fails when a required value is missing or unsafe.
func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	cfg := &Config{
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		JWTSecret:        getEnv("JWT_SECRET", ""),
		JWTRefreshSecret: getEnv("JWT_REFRESH_SECRET", ""),
		Port:             getEnv("PORT", "3000"),
		CORSOrigins:      strings.Split(getEnv("CORS_ORIGINS", "http://localhost:3000"), ","),
		OpenAIAPIKey:     getEnv("OPENAI_API_KEY", ""),
		OpenAIModel:      getEnv("OPENAI_MODEL", "gpt-4o-mini"),
		OpenAIBaseURL:    getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
	}
	if cfg.OpenAIAPIKey == "" {
		log.Println("OPENAI_API_KEY not set: summarization is disabled")
	}
	return cfg, cfg.validate()
}

func (c *Config) validate() error {
	var errs []error
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	if len(c.JWTSecret) < minSecretLen {
		errs = append(errs, errors.New("JWT_SECRET must be at least 32 characters"))
	}
	return errors.Join(errs...)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
