package middleware

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newApp() *fiber.App {
	app := fiber.New()
	app.Get("/", AuthMiddleware(&config.Config{JWTSecret: "test-secret"}), func(c *fiber.Ctx) error {
		return c.SendString(c.Locals("user_id").(string))
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
	valid, err := tokens.IssueAccess("test-secret", "user-1", "a@example.com", tokens.SourceWeb)
	require.NoError(t, err)
	forged, _ := tokens.IssueAccess("other-secret", "user-1", "a@example.com", tokens.SourceWeb)

	status, _ := do(t, app, "Bearer "+valid)
	assert.Equal(t, fiber.StatusOK, status)

	for name, header := range map[string]string{
		"missing":      "",
		"wrong scheme": "Basic " + valid,
		"empty bearer": "Bearer ",
		"forged":       "Bearer " + forged,
		"garbage":      "Bearer not-a-jwt",
	} {
		status, body := do(t, app, header)
		assert.Equal(t, fiber.StatusUnauthorized, status, name)
		assert.Equal(t, "TOKEN_EXPIRED", body["code"], name)
	}
}
