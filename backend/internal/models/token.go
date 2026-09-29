package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RefreshToken struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey"`
	// TokenHash is the SHA-256 of the refresh token; the raw token is never stored.
	TokenHash string    `gorm:"column:token;uniqueIndex:idx_refresh_tokens_token;not null"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index"`
	ExpiresAt time.Time `gorm:"not null;index"`
	CreatedAt time.Time

	Source     string `gorm:"default:'web'"`
	LastUsedAt *time.Time
	DeviceInfo string
}

func (rt *RefreshToken) BeforeCreate(tx *gorm.DB) error {
	rt.ID = uuid.New()
	return nil
}
