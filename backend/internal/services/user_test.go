package services

import (
	"testing"

	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdatePassword(t *testing.T) {
	db := setupDB(t)
	auth := NewAuthService(testConfig)
	resp := register(t, auth, "a@example.com")
	users := NewUserService()

	err := users.UpdatePassword(resp.User.ID, "wrong", "new-hash")
	assert.EqualError(t, err, "incorrect password")

	require.NoError(t, users.UpdatePassword(resp.User.ID, clientHash, "new-hash"))

	var tokens int64
	db.Model(&models.RefreshToken{}).Where("user_id = ?", resp.User.ID).Count(&tokens)
	assert.Zero(t, tokens, "password change must revoke refresh tokens")

	_, err = auth.Login(&LoginRequest{Email: "a@example.com", Password: clientHash})
	assert.Error(t, err, "old password must stop working")
	_, err = auth.Login(&LoginRequest{Email: "a@example.com", Password: "new-hash"})
	assert.NoError(t, err)
}

func TestUpdateProfileKeepsPassword(t *testing.T) {
	db := setupDB(t)
	resp := register(t, NewAuthService(testConfig), "a@example.com")

	var before models.User
	require.NoError(t, db.First(&before, "id = ?", resp.User.ID).Error)

	_, err := NewUserService().UpdateProfile(resp.User.ID, &UpdateProfileRequest{Name: "New"})
	require.NoError(t, err)

	var after models.User
	require.NoError(t, db.First(&after, "id = ?", resp.User.ID).Error)
	assert.Equal(t, "New", after.Name)
	assert.Equal(t, before.Password, after.Password)
}
