package database_test

import (
	"database/sql"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/pratts/tts-study-assistant/backend/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
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

func TestMigrateLowercasesEmails(t *testing.T) {
	db := testutil.NewDB(t)
	mixed := models.User{Email: "Mixed@Example.com", Password: "x"}
	clashA := models.User{Email: "Clash@Example.com", Password: "x"}
	clashB := models.User{Email: "clash@example.com", Password: "x"}
	require.NoError(t, db.Create(&[]models.User{mixed, clashA, clashB}).Error)

	require.NoError(t, database.Migrate(db))

	var emails []string
	db.Model(&models.User{}).Pluck("email", &emails)
	assert.ElementsMatch(t, []string{"Clash@Example.com", "clash@example.com", "mixed@example.com"}, emails,
		"colliding rows are left untouched")
}

func TestMigrateIsIdempotent(t *testing.T) {
	db := testutil.NewDB(t)
	require.NoError(t, database.Migrate(db))
	require.NoError(t, database.Migrate(db))
}

func TestIndexes(t *testing.T) {
	db := testutil.NewDB(t)
	var defs []string
	require.NoError(t, db.Raw(`SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema()`).Scan(&defs).Error)
	all := strings.Join(defs, "\n")

	for _, want := range []string{
		"idx_notes_user_created ON %s.notes USING btree (user_id, created_at DESC)",
		"idx_uid_did ON %s.notes USING btree (user_id, domain)",
		"idx_notes_user_source ON %s.notes USING btree (user_id, source_url)",
		"idx_refresh_tokens_user_id ON %s.refresh_tokens USING btree (user_id)",
		"idx_refresh_tokens_expires_at ON %s.refresh_tokens USING btree (expires_at)",
		"UNIQUE INDEX idx_refresh_tokens_token ON %s.refresh_tokens USING btree (token)",
	} {
		assert.Contains(t, all, fmt.Sprintf(want, schemaOf(t, db)))
	}
	assert.Equal(t, 1, strings.Count(all, "refresh_tokens USING btree (token)"), "no duplicate token index")
}

func TestNoteListUsesIndex(t *testing.T) {
	db := testutil.NewDB(t)
	var plan []string
	err := db.Transaction(func(tx *gorm.DB) error {
		// Empty tables have no useful statistics; force an index path so the
		// test checks which index the planner can use, not table size.
		tx.Exec("SET LOCAL enable_seqscan = off")
		tx.Exec("SET LOCAL enable_bitmapscan = off")
		return tx.Raw(`EXPLAIN SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`, uuid.New()).Scan(&plan).Error
	})
	require.NoError(t, err)
	joined := strings.Join(plan, "\n")
	assert.Contains(t, joined, "idx_notes_user_created")
	assert.NotContains(t, joined, "Sort", "the index already provides the order")
}

func TestUserDeleteCascades(t *testing.T) {
	db := testutil.NewDB(t)
	user := models.User{Email: "a@example.com", Password: "x"}
	require.NoError(t, db.Create(&user).Error)
	require.NoError(t, db.Create(&models.Note{UserID: user.ID, Content: "c"}).Error)
	require.NoError(t, db.Create(&models.RefreshToken{TokenHash: strings.Repeat("b", 64), UserID: user.ID, ExpiresAt: time.Now()}).Error)

	require.NoError(t, db.Delete(&user).Error)

	var notes, tokens int64
	db.Model(&models.Note{}).Count(&notes)
	db.Model(&models.RefreshToken{}).Count(&tokens)
	assert.Zero(t, notes)
	assert.Zero(t, tokens)
}

func TestMigrateUpgradesForeignKeysToCascade(t *testing.T) {
	db := testutil.NewDB(t)
	// Recreate the constraints the way older deployments have them.
	for table, fk := range map[string]string{"notes": "fk_users_notes", "refresh_tokens": "fk_users_refresh_tokens"} {
		require.NoError(t, db.Exec(fmt.Sprintf(`ALTER TABLE %[1]s DROP CONSTRAINT %[2]s,
			ADD CONSTRAINT %[2]s FOREIGN KEY (user_id) REFERENCES users(id)`, table, fk)).Error)
	}

	require.NoError(t, database.Migrate(db))

	var actions []string
	require.NoError(t, db.Raw(`SELECT confdeltype::text FROM pg_constraint
		WHERE conname IN ('fk_users_notes', 'fk_users_refresh_tokens') AND connamespace = current_schema()::regnamespace`).Scan(&actions).Error)
	assert.Equal(t, []string{"c", "c"}, actions)
}

func TestIDsHaveNoDatabaseDefault(t *testing.T) {
	db := testutil.NewDB(t)
	var defaults []sql.NullString
	require.NoError(t, db.Raw(`SELECT column_default FROM information_schema.columns
		WHERE table_schema = current_schema() AND column_name = 'id'`).Scan(&defaults).Error)
	require.Len(t, defaults, 3)
	for _, d := range defaults {
		assert.False(t, d.Valid, "IDs are generated in Go; no uuid-ossp dependency: %s", d.String)
	}
}

func schemaOf(t *testing.T, db *gorm.DB) string {
	var s string
	require.NoError(t, db.Raw("SELECT current_schema()").Scan(&s).Error)
	return s
}
