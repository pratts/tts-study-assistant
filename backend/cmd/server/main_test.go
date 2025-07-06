package main

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/stretchr/testify/assert"
)

func TestSetupRoutes(t *testing.T) {
	app := fiber.New()
	cfg := &config.Config{
		JWTSecret:   "test-secret",
		CORSOrigins: []string{"http://localhost:3000"},
	}

	setupRoutes(app, cfg)

	// Test that health endpoint exists
	req := httptest.NewRequest("GET", "/health", nil)
	resp, _ := app.Test(req)
	assert.Equal(t, 200, resp.StatusCode)

	// Test that auth routes exist
	authRoutes := []string{
		"/api/v1/auth/register",
		"/api/v1/auth/login",
		"/api/v1/auth/refresh",
		"/api/v1/auth/logout",
	}

	for _, route := range authRoutes {
		req := httptest.NewRequest("POST", route, nil)
		resp, _ := app.Test(req)
		// Should not be 404 (route exists)
		assert.NotEqual(t, 404, resp.StatusCode)
	}
}
