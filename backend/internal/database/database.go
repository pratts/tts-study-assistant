package database

import (
	"log"

	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Connect(databaseURL string) error {
	var err error

	DB, err = gorm.Open(postgres.Open(databaseURL), GormConfig())
	if err != nil {
		return err
	}

	log.Println("Database connected successfully")

	if err := Migrate(DB); err != nil {
		return err
	}

	log.Println("Database migrated successfully")
	return nil
}

// GormConfig returns the GORM settings shared by the server and tests.
// TranslateError maps unique violations to gorm.ErrDuplicatedKey.
func GormConfig() *gorm.Config {
	return &gorm.Config{TranslateError: true}
}

// Migrate creates or updates the schema for all models.
func Migrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.User{},
		&models.Note{},
		&models.RefreshToken{},
	); err != nil {
		return err
	}
	// Refresh tokens used to be stored in plaintext (36-char UUIDs). Only
	// 64-char SHA-256 hashes are valid now, so drop the legacy rows.
	if err := db.Where("length(token) <> 64").Delete(&models.RefreshToken{}).Error; err != nil {
		return err
	}
	// Emails are now stored lower-cased. Normalize older rows unless that
	// would collide with an existing account.
	return db.Exec(`UPDATE users u SET email = lower(trim(u.email))
		WHERE u.email <> lower(trim(u.email))
		AND NOT EXISTS (SELECT 1 FROM users o WHERE o.email = lower(trim(u.email)))`).Error
}
