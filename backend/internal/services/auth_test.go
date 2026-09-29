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

func TestRegisterStoresBcryptHash(t *testing.T) {
	e := newEnv(t)
	e.register(t, "a@example.com")

	var u models.User
	require.NoError(t, e.db.Where("email = ?", "a@example.com").First(&u).Error)
	assert.NotEqual(t, clientHash, u.Password)
	assert.True(t, strings.HasPrefix(u.Password, "$2"), "password must be bcrypt-hashed")
}

func TestRegisterDuplicate(t *testing.T) {
	e := newEnv(t)
	e.register(t, "a@example.com")
	_, err := e.auth.Register(ctx, &RegisterRequest{Email: "a@example.com", Password: clientHash, Name: "Again"})
	assert.ErrorIs(t, err, ErrUserExists)
}

func TestRegisterConcurrentDuplicate(t *testing.T) {
	e := newEnv(t)
	const n = 6
	errs := make(chan error, n)
	for range n {
		go func() {
			_, err := e.auth.Register(ctx, &RegisterRequest{Email: "race@example.com", Password: clientHash, Name: "R"})
			errs <- err
		}()
	}
	ok := 0
	for range n {
		if err := <-errs; err == nil {
			ok++
		} else {
			assert.ErrorIs(t, err, ErrUserExists, "race losers must get a conflict, not a 500")
		}
	}
	assert.Equal(t, 1, ok)
}

func TestLogin(t *testing.T) {
	e := newEnv(t)
	e.register(t, "a@example.com")

	resp, err := e.auth.Login(ctx, &LoginRequest{Email: "a@example.com", Password: clientHash})
	require.NoError(t, err)
	assert.NotEmpty(t, resp.AccessToken)
	assert.Equal(t, "a@example.com", resp.User.Email)

	_, err = e.auth.Login(ctx, &LoginRequest{Email: "a@example.com", Password: "wrong"})
	assert.ErrorIs(t, err, ErrInvalidCredentials)

	_, err = e.auth.Login(ctx, &LoginRequest{Email: "missing@example.com", Password: clientHash})
	assert.ErrorIs(t, err, ErrInvalidCredentials)
}

func TestLoginUpgradesLegacyHash(t *testing.T) {
	e := newEnv(t)
	legacy := models.User{Email: "old@example.com", Password: clientHash, Name: "Old"}
	require.NoError(t, e.db.Create(&legacy).Error)

	_, err := e.auth.Login(ctx, &LoginRequest{Email: "old@example.com", Password: clientHash})
	require.NoError(t, err)

	var u models.User
	require.NoError(t, e.db.First(&u, "id = ?", legacy.ID).Error)
	assert.True(t, strings.HasPrefix(u.Password, "$2"), "legacy hash must be upgraded on login")

	_, err = e.auth.Login(ctx, &LoginRequest{Email: "old@example.com", Password: clientHash})
	assert.NoError(t, err, "login must keep working after the upgrade")
}

func TestLoginSourceControlsLifetime(t *testing.T) {
	e := newEnv(t)
	e.register(t, "a@example.com")

	for source, ttl := range map[string]time.Duration{
		"extension": 90 * 24 * time.Hour,
		"bogus":     30 * 24 * time.Hour,
	} {
		resp, err := e.auth.Login(ctx, &LoginRequest{Email: "a@example.com", Password: clientHash, Source: source})
		require.NoError(t, err)
		var rt models.RefreshToken
		require.NoError(t, e.db.First(&rt, "token = ?", tokens.HashRefresh(resp.RefreshToken)).Error)
		assert.WithinDuration(t, time.Now().Add(ttl), rt.ExpiresAt, time.Minute, source)
	}
}

func TestRefreshTokenStoredHashed(t *testing.T) {
	e := newEnv(t)
	resp, uid := e.register(t, "a@example.com")

	var rt models.RefreshToken
	require.NoError(t, e.db.First(&rt, "user_id = ?", uid).Error)
	assert.NotEqual(t, resp.RefreshToken, rt.TokenHash)
	assert.Equal(t, tokens.HashRefresh(resp.RefreshToken), rt.TokenHash)
}

func TestRefreshRotatesAndRejectsReuse(t *testing.T) {
	e := newEnv(t)
	first, _ := e.register(t, "a@example.com")

	second, err := e.auth.Refresh(ctx, first.RefreshToken)
	require.NoError(t, err)
	assert.NotEqual(t, first.RefreshToken, second.RefreshToken)

	_, err = e.auth.Refresh(ctx, first.RefreshToken)
	assert.ErrorIs(t, err, ErrInvalidRefreshToken, "a rotated token must not be reusable")

	_, err = e.auth.Refresh(ctx, second.RefreshToken)
	assert.NoError(t, err)
}

func TestRefreshConcurrentUseSucceedsOnce(t *testing.T) {
	e := newEnv(t)
	resp, _ := e.register(t, "a@example.com")

	const n = 8
	var wg sync.WaitGroup
	var successes atomic.Int32
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := e.auth.Refresh(ctx, resp.RefreshToken); err == nil {
				successes.Add(1)
			}
		}()
	}
	wg.Wait()
	assert.EqualValues(t, 1, successes.Load())
}

func TestRefreshRejectsExpired(t *testing.T) {
	e := newEnv(t)
	resp, uid := e.register(t, "a@example.com")
	e.db.Model(&models.RefreshToken{}).Where("user_id = ?", uid).Update("expires_at", time.Now().Add(-time.Minute))

	_, err := e.auth.Refresh(ctx, resp.RefreshToken)
	assert.ErrorIs(t, err, ErrInvalidRefreshToken)
}

func TestLogoutRevokes(t *testing.T) {
	e := newEnv(t)
	resp, _ := e.register(t, "a@example.com")

	require.NoError(t, e.auth.Logout(ctx, resp.RefreshToken))
	_, err := e.auth.Refresh(ctx, resp.RefreshToken)
	assert.ErrorIs(t, err, ErrInvalidRefreshToken)
	assert.NoError(t, e.auth.Logout(ctx, "unknown"), "logout is idempotent")
}

func TestCleanupExpiredRefreshTokens(t *testing.T) {
	e := newEnv(t)
	_, uid := e.register(t, "a@example.com")
	e.register(t, "b@example.com")
	e.db.Model(&models.RefreshToken{}).Where("user_id = ?", uid).Update("expires_at", time.Now().Add(-time.Minute))

	require.NoError(t, e.auth.CleanupExpiredRefreshTokens(ctx))
	var n int64
	e.db.Model(&models.RefreshToken{}).Count(&n)
	assert.EqualValues(t, 1, n)
}
