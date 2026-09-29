package services

import (
	"strings"
	"testing"

	"github.com/pratts/tts-study-assistant/backend/internal/models"
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
