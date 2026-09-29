package middleware

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newApp() *fiber.App {
	app := fiber.New()
	app.Get("/", Auth("test-secret"), func(c *fiber.Ctx) error {
		return c.SendString(UserID(c).String())
	})
	return app
}

func do(t *testing.T, app *fiber.App, auth string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest("GET", "/", nil)
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	resp, err := app.Test(req)
	require.NoError(t, err)
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body
}

func TestAuthMiddleware(t *testing.T) {
	app := newApp()
	const uid = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"
	valid, err := tokens.IssueAccess("test-secret", uid, "a@example.com", tokens.SourceWeb)
	require.NoError(t, err)
	forged, _ := tokens.IssueAccess("other-secret", uid, "a@example.com", tokens.SourceWeb)
	badSubject, _ := tokens.IssueAccess("test-secret", "not-a-uuid", "a@example.com", tokens.SourceWeb)

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+valid)
	resp, err := app.Test(req)
	require.NoError(t, err)
	assert.Equal(t, fiber.StatusOK, resp.StatusCode)
	body, _ := io.ReadAll(resp.Body)
	assert.Equal(t, uid, string(body), "handler sees the typed user ID")

	for name, header := range map[string]string{
		"missing":      "",
		"wrong scheme": "Basic " + valid,
		"empty bearer": "Bearer ",
		"forged":       "Bearer " + forged,
		"garbage":      "Bearer not-a-jwt",
		"bad subject":  "Bearer " + badSubject,
	} {
		status, body := do(t, app, header)
		assert.Equal(t, fiber.StatusUnauthorized, status, name)
		assert.Equal(t, "TOKEN_EXPIRED", body["code"], name)
	}
}
