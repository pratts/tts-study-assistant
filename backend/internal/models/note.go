package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Note struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:uuid_generate_v4()"`
	UserID      uuid.UUID `gorm:"type:uuid;not null"`
	Content     string    `gorm:"type:text;not null"`
	SourceURL   string
	SourceTitle string
	Domain      string         `gorm:"type:text" json:"domain,omitempty"`
	Metadata    datatypes.JSON `gorm:"type:jsonb" json:"metadata,omitempty"`
	CreatedAt   time.Time
	UpdatedAt   time.Time

	User User `gorm:"foreignKey:UserID"`
}

func (n *Note) BeforeCreate(tx *gorm.DB) error {
	n.ID = uuid.New()
	return nil
}
