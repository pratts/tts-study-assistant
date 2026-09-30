package services

import (
	"testing"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdatePassword(t *testing.T) {
	e := newEnv(t)
	_, uid := e.register(t, "a@example.com")

	assert.ErrorIs(t, e.users.UpdatePassword(ctx, uid, "wrong", "new-hash"), ErrIncorrectPassword)
	require.NoError(t, e.users.UpdatePassword(ctx, uid, testPassword, "new-hash"))

	var tokens int64
	e.db.Model(&models.RefreshToken{}).Where("user_id = ?", uid).Count(&tokens)
	assert.Zero(t, tokens, "password change must revoke refresh tokens")

	_, err := e.auth.Login(ctx, &LoginRequest{Email: "a@example.com", Password: testPassword})
	assert.ErrorIs(t, err, ErrInvalidCredentials, "old password must stop working")
	_, err = e.auth.Login(ctx, &LoginRequest{Email: "a@example.com", Password: "new-hash"})
	assert.NoError(t, err)
}

func TestUpdateProfile(t *testing.T) {
	e := newEnv(t)
	_, uid := e.register(t, "a@example.com")
	e.register(t, "taken@example.com")

	var before models.User
	require.NoError(t, e.db.First(&before, "id = ?", uid).Error)

	p, err := e.users.UpdateProfile(ctx, uid, &UpdateProfileRequest{Name: "New", Email: "new@example.com"})
	require.NoError(t, err)
	assert.Equal(t, "New", p.Name)
	assert.Equal(t, "new@example.com", p.Email)

	var after models.User
	require.NoError(t, e.db.First(&after, "id = ?", uid).Error)
	assert.Equal(t, before.Password, after.Password, "profile updates never touch the password")

	_, err = e.users.UpdateProfile(ctx, uid, &UpdateProfileRequest{Email: "taken@example.com"})
	assert.ErrorIs(t, err, ErrEmailTaken)
}

func TestGetProfileNotFound(t *testing.T) {
	e := newEnv(t)
	_, err := e.users.GetProfile(ctx, uuid.New())
	assert.ErrorIs(t, err, ErrNotFound)
}
