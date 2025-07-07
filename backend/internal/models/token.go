package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RefreshToken struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:uuid_generate_v4()"`
	Token     string    `gorm:"uniqueIndex;not null"`
	UserID    uuid.UUID `gorm:"type:uuid;not null"`
	ExpiresAt time.Time `gorm:"not null"`
	CreatedAt time.Time

	// New fields for source, last used, and device info
	Source     string `gorm:"default:'web'"`
	LastUsedAt *time.Time
	DeviceInfo string

	User User `gorm:"foreignKey:UserID"`
}

func (rt *RefreshToken) BeforeCreate(tx *gorm.DB) error {
	rt.ID = uuid.New()
	return nil
}
