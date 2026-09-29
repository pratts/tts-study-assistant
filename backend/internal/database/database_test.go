package database_test

import (
	"strings"
	"testing"
	"time"

	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/pratts/tts-study-assistant/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMigrateDropsPlaintextRefreshTokens(t *testing.T) {
	db := testutil.NewDB(t)
	user := models.User{Email: "a@example.com", Password: "x"}
	require.NoError(t, db.Create(&user).Error)

	legacy := models.RefreshToken{TokenHash: "0b7f3c5e-0000-4000-8000-000000000000", UserID: user.ID, ExpiresAt: time.Now().Add(time.Hour)}
	hashed := models.RefreshToken{TokenHash: strings.Repeat("a", 64), UserID: user.ID, ExpiresAt: time.Now().Add(time.Hour)}
	require.NoError(t, db.Create(&legacy).Error)
	require.NoError(t, db.Create(&hashed).Error)

	require.NoError(t, database.Migrate(db))

	var remaining []models.RefreshToken
	require.NoError(t, db.Find(&remaining).Error)
	require.Len(t, remaining, 1)
	assert.Equal(t, hashed.TokenHash, remaining[0].TokenHash)
}
