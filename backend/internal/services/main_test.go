package services

import (
	"testing"

	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/password"
	"github.com/pratts/tts-study-assistant/backend/internal/testutil"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func init() { password.Cost = bcrypt.MinCost }

var testConfig = &config.Config{JWTSecret: "test-secret"}

// setupDB points the package-level database at a fresh isolated schema.
func setupDB(t *testing.T) *gorm.DB {
	db := testutil.NewDB(t)
	database.DB = db
	return db
}
