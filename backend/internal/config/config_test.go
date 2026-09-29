package config

import (
	"strings"
	"testing"

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
