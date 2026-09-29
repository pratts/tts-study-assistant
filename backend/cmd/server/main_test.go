package main

import (
	"bytes"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testCfg = &config.Config{
	JWTSecret:   strings.Repeat("s", 32),
	CORSOrigins: []string{"http://localhost:3000"},
}

func send(t *testing.T, app *fiber.App, method, path string, body []byte, headers map[string]string) int {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	return resp.StatusCode
}

func TestRoutesExist(t *testing.T) {
	app := newApp(testCfg)
	assert.Equal(t, 200, send(t, app, "GET", "/health", nil, nil))

	for _, route := range []string{"/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/auth/login", "/api/v1/auth/register"} {
		assert.NotEqual(t, 404, send(t, app, "POST", route, nil, nil), route)
	}
	assert.Equal(t, 401, send(t, app, "GET", "/api/v1/auth/verify", nil, nil))
}

func TestSecurityHeaders(t *testing.T) {
	resp, err := newApp(testCfg).Test(httptest.NewRequest("GET", "/health", nil))
	require.NoError(t, err)
	assert.Equal(t, "nosniff", resp.Header.Get("X-Content-Type-Options"))
	assert.Equal(t, "SAMEORIGIN", resp.Header.Get("X-Frame-Options"))
	assert.Equal(t, "cross-origin", resp.Header.Get("Cross-Origin-Resource-Policy"))
}

func TestLoginRateLimited(t *testing.T) {
	app := newApp(testCfg)
	for i := range authRateLimit {
		assert.Equal(t, 400, send(t, app, "POST", "/api/v1/auth/login", []byte(`{}`), nil), "request %d", i)
	}
	assert.Equal(t, 429, send(t, app, "POST", "/api/v1/auth/login", []byte(`{}`), nil))
}

func TestBodyLimit(t *testing.T) {
	big := []byte(`{"content":"` + strings.Repeat("a", bodyLimit) + `"}`)
	req := httptest.NewRequest("POST", "/api/v1/auth/register", bytes.NewReader(big))
	resp, err := newApp(testCfg).Test(req, -1)
	// fasthttp rejects the request before routing; the in-memory test
	// transport surfaces that as an error instead of a 413 response.
	if err != nil {
		assert.ErrorContains(t, err, "body size exceeds")
		return
	}
	assert.Equal(t, fiber.StatusRequestEntityTooLarge, resp.StatusCode)
}

func TestInvalidNoteIDIsBadRequest(t *testing.T) {
	tok, err := tokens.IssueAccess(testCfg.JWTSecret, "00000000-0000-0000-0000-000000000001", "a@example.com", tokens.SourceWeb)
	require.NoError(t, err)
	auth := map[string]string{"Authorization": "Bearer " + tok}
	app := newApp(testCfg)

	assert.Equal(t, 400, send(t, app, "GET", "/api/v1/notes/not-a-uuid", nil, auth))
	assert.Equal(t, 400, send(t, app, "PUT", "/api/v1/notes/not-a-uuid", []byte(`{}`), auth))
	assert.Equal(t, 400, send(t, app, "DELETE", "/api/v1/notes/1", nil, auth))
	assert.Equal(t, 400, send(t, app, "POST", "/api/v1/notes/1/summarize", nil, auth))
}
