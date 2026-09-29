package services

import (
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const clientHash = "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b"

func register(t *testing.T, s *AuthService, email string) *AuthResponse {
	t.Helper()
	resp, err := s.Register(&RegisterRequest{Email: email, Password: clientHash, Name: "Test"})
	require.NoError(t, err)
	return resp
}

func TestRegisterStoresBcryptHash(t *testing.T) {
	db := setupDB(t)
	s := NewAuthService(testConfig)
	register(t, s, "a@example.com")

	var u models.User
	require.NoError(t, db.Where("email = ?", "a@example.com").First(&u).Error)
	assert.NotEqual(t, clientHash, u.Password)
	assert.True(t, strings.HasPrefix(u.Password, "$2"), "password must be bcrypt-hashed")
}

func TestLogin(t *testing.T) {
	setupDB(t)
	s := NewAuthService(testConfig)
	register(t, s, "a@example.com")

	resp, err := s.Login(&LoginRequest{Email: "a@example.com", Password: clientHash})
	require.NoError(t, err)
	assert.NotEmpty(t, resp.AccessToken)

	_, err = s.Login(&LoginRequest{Email: "a@example.com", Password: "wrong"})
	assert.EqualError(t, err, "invalid credentials")

	_, err = s.Login(&LoginRequest{Email: "missing@example.com", Password: clientHash})
	assert.EqualError(t, err, "invalid credentials")
}

func TestLoginUpgradesLegacyHash(t *testing.T) {
	db := setupDB(t)
	legacy := models.User{Email: "old@example.com", Password: clientHash, Name: "Old"}
	require.NoError(t, db.Create(&legacy).Error)

	s := NewAuthService(testConfig)
	_, err := s.Login(&LoginRequest{Email: "old@example.com", Password: clientHash})
	require.NoError(t, err)

	var u models.User
	require.NoError(t, db.First(&u, "id = ?", legacy.ID).Error)
	assert.True(t, strings.HasPrefix(u.Password, "$2"), "legacy hash must be upgraded on login")

	_, err = s.Login(&LoginRequest{Email: "old@example.com", Password: clientHash})
	assert.NoError(t, err, "login must keep working after the upgrade")
}

func TestRefreshTokenStoredHashed(t *testing.T) {
	db := setupDB(t)
	resp := register(t, NewAuthService(testConfig), "a@example.com")

	var rt models.RefreshToken
	require.NoError(t, db.First(&rt, "user_id = ?", resp.User.ID).Error)
	assert.NotEqual(t, resp.RefreshToken, rt.TokenHash)
	assert.Equal(t, tokens.HashRefresh(resp.RefreshToken), rt.TokenHash)
}

func TestRefreshRotatesAndRejectsReuse(t *testing.T) {
	setupDB(t)
	s := NewAuthService(testConfig)
	first := register(t, s, "a@example.com")

	second, err := s.Refresh(&RefreshRequest{RefreshToken: first.RefreshToken})
	require.NoError(t, err)
	assert.NotEqual(t, first.RefreshToken, second.RefreshToken)

	_, err = s.Refresh(&RefreshRequest{RefreshToken: first.RefreshToken})
	assert.EqualError(t, err, "invalid refresh token", "a rotated token must not be reusable")

	_, err = s.Refresh(&RefreshRequest{RefreshToken: second.RefreshToken})
	assert.NoError(t, err)
}

func TestRefreshConcurrentUseSucceedsOnce(t *testing.T) {
	setupDB(t)
	s := NewAuthService(testConfig)
	resp := register(t, s, "a@example.com")

	const n = 8
	var wg sync.WaitGroup
	var successes atomic.Int32
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.Refresh(&RefreshRequest{RefreshToken: resp.RefreshToken}); err == nil {
				successes.Add(1)
			}
		}()
	}
	wg.Wait()
	assert.EqualValues(t, 1, successes.Load())
}

func TestRefreshRejectsExpired(t *testing.T) {
	db := setupDB(t)
	s := NewAuthService(testConfig)
	resp := register(t, s, "a@example.com")
	db.Model(&models.RefreshToken{}).Where("user_id = ?", resp.User.ID).
		Update("expires_at", time.Now().Add(-time.Minute))

	_, err := s.Refresh(&RefreshRequest{RefreshToken: resp.RefreshToken})
	assert.EqualError(t, err, "invalid refresh token")
}

func TestLoginSourceControlsLifetime(t *testing.T) {
	db := setupDB(t)
	s := NewAuthService(testConfig)
	register(t, s, "a@example.com")

	for source, ttl := range map[string]time.Duration{
		"extension": 90 * 24 * time.Hour,
		"bogus":     30 * 24 * time.Hour,
	} {
		resp, err := s.Login(&LoginRequest{Email: "a@example.com", Password: clientHash, Source: source})
		require.NoError(t, err)
		var rt models.RefreshToken
		require.NoError(t, db.First(&rt, "token = ?", tokens.HashRefresh(resp.RefreshToken)).Error)
		assert.WithinDuration(t, time.Now().Add(ttl), rt.ExpiresAt, time.Minute, source)
	}
}

func TestLogoutRevokes(t *testing.T) {
	setupDB(t)
	s := NewAuthService(testConfig)
	resp := register(t, s, "a@example.com")

	require.NoError(t, s.Logout(resp.RefreshToken))
	_, err := s.Refresh(&RefreshRequest{RefreshToken: resp.RefreshToken})
	assert.Error(t, err)
	assert.NoError(t, s.Logout("unknown"), "logout is idempotent")
}

func TestCleanupExpiredRefreshTokens(t *testing.T) {
	db := setupDB(t)
	s := NewAuthService(testConfig)
	resp := register(t, s, "a@example.com")
	register(t, s, "b@example.com")
	db.Model(&models.RefreshToken{}).Where("user_id = ?", resp.User.ID).
		Update("expires_at", time.Now().Add(-time.Minute))

	require.NoError(t, s.CleanupExpiredRefreshTokens())
	var n int64
	db.Model(&models.RefreshToken{}).Count(&n)
	assert.EqualValues(t, 1, n)
}
