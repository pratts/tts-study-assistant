package database

import (
	"fmt"
	"time"

	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// PoolConfig sizes the connection pool.
type PoolConfig struct {
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
}

// Connect opens the database, sizes the pool and migrates the schema.
func Connect(databaseURL string, pool PoolConfig) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(databaseURL), GormConfig())
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(pool.MaxOpenConns)
	sqlDB.SetMaxIdleConns(pool.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(pool.ConnMaxLifetime)
	sqlDB.SetConnMaxIdleTime(pool.ConnMaxIdleTime)

	if err := Migrate(db); err != nil {
		return nil, err
	}
	return db, nil
}

// GormConfig returns the GORM settings shared by the server and tests.
//   - TranslateError maps unique violations to gorm.ErrDuplicatedKey.
//   - SkipDefaultTransaction: single writes don't need a wrapping
//     transaction; multi-statement writes use explicit ones.
//   - PrepareStmt caches prepared statements per connection. Disable it if
//     you put PgBouncer in transaction-pooling mode in front of Postgres.
func GormConfig() *gorm.Config {
	return &gorm.Config{
		TranslateError:         true,
		SkipDefaultTransaction: true,
		PrepareStmt:            true,
	}
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
	// AutoMigrate never alters an existing foreign key, so databases created
	// before ON DELETE CASCADE was declared need it applied explicitly.
	for table, constraint := range map[string]string{
		"notes":          "fk_users_notes",
		"refresh_tokens": "fk_users_refresh_tokens",
	} {
		if err := ensureCascade(db, table, constraint); err != nil {
			return err
		}
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

// ensureCascade recreates a user_id → users(id) foreign key with ON DELETE
// CASCADE unless it already has it. It is a no-op on up-to-date schemas.
func ensureCascade(db *gorm.DB, table, constraint string) error {
	var deleteAction string
	err := db.Raw(`SELECT confdeltype::text FROM pg_constraint
		WHERE conname = ? AND conrelid = to_regclass(?)`, constraint, table).Scan(&deleteAction).Error
	if err != nil || deleteAction == "c" {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		return tx.Exec(fmt.Sprintf(`ALTER TABLE %[1]s DROP CONSTRAINT IF EXISTS %[2]s,
			ADD CONSTRAINT %[2]s FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
			table, constraint)).Error
	})
}
