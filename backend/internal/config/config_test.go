package config

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestValidate(t *testing.T) {
	valid := Config{DatabaseURL: "postgres://x", JWTSecret: strings.Repeat("s", 32)}
	assert.NoError(t, valid.validate())

	missing := Config{}
	err := missing.validate()
	assert.ErrorContains(t, err, "DATABASE_URL")
	assert.ErrorContains(t, err, "JWT_SECRET")

	weak := Config{DatabaseURL: "postgres://x", JWTSecret: "short"}
	assert.ErrorContains(t, weak.validate(), "JWT_SECRET")
}

func TestLoadFailsWithoutSecrets(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", "")
	_, err := Load()
	assert.Error(t, err)
}

func TestLoadPoolSettings(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", strings.Repeat("s", 32))
	t.Setenv("DB_MAX_OPEN_CONNS", "")
	t.Setenv("DB_CONN_MAX_LIFETIME", "")

	cfg, err := Load()
	assert.NoError(t, err)
	assert.Equal(t, 25, cfg.DBMaxOpenConns)
	assert.Equal(t, 30*time.Minute, cfg.DBConnMaxLifetime)

	t.Setenv("DB_MAX_OPEN_CONNS", "50")
	t.Setenv("DB_CONN_MAX_LIFETIME", "5m")
	cfg, err = Load()
	assert.NoError(t, err)
	assert.Equal(t, 50, cfg.DBMaxOpenConns)
	assert.Equal(t, 5*time.Minute, cfg.DBConnMaxLifetime)

	t.Setenv("DB_MAX_OPEN_CONNS", "zero")
	t.Setenv("DB_CONN_MAX_LIFETIME", "-1s")
	_, err = Load()
	assert.ErrorContains(t, err, "DB_MAX_OPEN_CONNS")
	assert.ErrorContains(t, err, "DB_CONN_MAX_LIFETIME")
}
