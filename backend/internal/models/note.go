package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Note indexes, all leading with user_id because every query is scoped to
// one user:
//   - idx_notes_user_created: the default list, ordered by created_at DESC
//   - idx_uid_did: domain filter and per-domain stats
//   - idx_notes_user_source: the extension's lookup by source_url
type Note struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;index:idx_uid_did,priority:1;index:idx_notes_user_created,priority:1;index:idx_notes_user_source,priority:1"`
	Content     string    `gorm:"type:text;not null"`
	SourceURL   string    `gorm:"index:idx_notes_user_source,priority:2"`
	SourceTitle string
	Domain      string         `gorm:"type:text;index:idx_uid_did,priority:2"`
	Metadata    datatypes.JSON `gorm:"type:jsonb"`
	Summary     string         `gorm:"type:text"`
	CreatedAt   time.Time      `gorm:"index:idx_notes_user_created,priority:2,sort:desc"`
	UpdatedAt   time.Time
}

func (n *Note) BeforeCreate(tx *gorm.DB) error {
	n.ID = uuid.New()
	return nil
}
