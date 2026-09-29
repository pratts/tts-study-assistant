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

	DB, err = gorm.Open(postgres.Open(databaseURL), &gorm.Config{})
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
	return db.Where("length(token) <> 64").Delete(&models.RefreshToken{}).Error
}
