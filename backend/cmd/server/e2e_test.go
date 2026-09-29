package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/password"
	"github.com/pratts/tts-study-assistant/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

const pw = "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b"

type client struct {
	t     *testing.T
	app   *fiber.App
	token string
}

func (c *client) do(method, path string, body any) (int, map[string]any) {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, r)
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.app.Test(req, -1)
	require.NoError(c.t, err)
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func data(m map[string]any) map[string]any { return m["data"].(map[string]any) }

// TestAPIFlow drives the real router, middleware and services end to end.
func TestAPIFlow(t *testing.T) {
	password.Cost = bcrypt.MinCost
	app := newApp(testCfg, testutil.NewDB(t))
	alice := &client{t: t, app: app}
	bob := &client{t: t, app: app}

	status, body := alice.do("POST", "/api/v1/auth/register", map[string]string{"email": " Alice@Example.com", "password": pw, "name": "Alice"})
	require.Equal(t, 200, status, body)
	assert.Equal(t, "alice@example.com", data(body)["user"].(map[string]any)["email"])

	status, _ = alice.do("POST", "/api/v1/auth/register", map[string]string{"email": "alice@example.com", "password": pw, "name": "Alice"})
	assert.Equal(t, 409, status)

	status, _ = alice.do("POST", "/api/v1/auth/login", map[string]string{"email": "alice@example.com", "password": "wrong"})
	assert.Equal(t, 401, status)

	status, body = alice.do("POST", "/api/v1/auth/login", map[string]string{"email": "ALICE@example.com", "password": pw, "source": "extension"})
	require.Equal(t, 200, status, body)
	alice.token = data(body)["access_token"].(string)
	refresh := data(body)["refresh_token"].(string)

	// /auth/verify returns a bare user object (extension contract).
	status, body = alice.do("GET", "/api/v1/auth/verify", nil)
	assert.Equal(t, 200, status)
	assert.Equal(t, "alice@example.com", body["email"])
	assert.Nil(t, body["data"])

	status, body = alice.do("POST", "/api/v1/notes", map[string]any{"content": "Some note content", "source_url": "https://news.bbc.co.uk/a", "metadata": map[string]string{"k": "v"}})
	require.Equal(t, 200, status, body)
	note := data(body)
	noteURL := "/api/v1/notes/" + note["id"].(string)
	assert.Equal(t, "bbc.co.uk", note["domain"])
	assert.Equal(t, map[string]any{"k": "v"}, note["metadata"])

	status, _ = alice.do("POST", "/api/v1/notes", map[string]any{"content": "x", "metadata": []int{1}})
	assert.Equal(t, 400, status)

	status, body = alice.do("PUT", noteURL, map[string]any{"source_title": "Title"})
	require.Equal(t, 200, status, body)
	assert.Equal(t, "Some note content", data(body)["content"], "partial update keeps content")

	status, _ = alice.do("POST", noteURL+"/summarize", nil)
	assert.Equal(t, 503, status, "no OpenAI key configured")

	// Bob cannot see Alice's note.
	_, body = bob.do("POST", "/api/v1/auth/register", map[string]string{"email": "bob@example.com", "password": pw, "name": "Bob"})
	bob.token = data(body)["access_token"].(string)
	status, _ = bob.do("GET", noteURL, nil)
	assert.Equal(t, 404, status)
	status, _ = bob.do("DELETE", noteURL, nil)
	assert.Equal(t, 404, status)

	status, body = alice.do("GET", "/api/v1/notes?page_size=500", nil)
	assert.Equal(t, 200, status)
	assert.Len(t, body["data"], 1)

	status, body = alice.do("GET", "/api/v1/notes/stats", nil)
	assert.Equal(t, 200, status)
	assert.Equal(t, []any{map[string]any{"domain": "bbc.co.uk", "count": float64(1)}}, body["data"])

	status, _ = alice.do("PUT", "/api/v1/user/profile", map[string]string{"email": "bob@example.com"})
	assert.Equal(t, 409, status)

	status, _ = alice.do("PUT", "/api/v1/user/password", map[string]string{"old_password": "wrong", "new_password": "n"})
	assert.Equal(t, 401, status)
	status, _ = alice.do("PUT", "/api/v1/user/password", map[string]string{"old_password": pw, "new_password": "new"})
	assert.Equal(t, 200, status)

	status, _ = alice.do("POST", "/api/v1/auth/refresh", map[string]string{"refresh_token": refresh})
	assert.Equal(t, 401, status, "password change revoked the session")

	status, _ = alice.do("DELETE", noteURL, nil)
	assert.Equal(t, 200, status)
	status, _ = alice.do("GET", noteURL, nil)
	assert.Equal(t, 404, status)
}
