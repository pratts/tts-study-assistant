package services

import (
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type NotesService struct {
	db *gorm.DB
}

type CreateNoteRequest struct {
	Content     string         `json:"content" validate:"required"`
	SourceURL   string         `json:"source_url,omitempty"`
	SourceTitle string         `json:"source_title,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type UpdateNoteRequest struct {
	Content     string         `json:"content,omitempty"`
	SourceURL   string         `json:"source_url,omitempty"`
	SourceTitle string         `json:"source_title,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type NoteResponse struct {
	ID          string         `json:"id"`
	Content     string         `json:"content"`
	SourceURL   string         `json:"source_url,omitempty"`
	SourceTitle string         `json:"source_title,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"` // Arbitrary metadata for the note
	CreatedAt   string         `json:"created_at"`
	UpdatedAt   string         `json:"updated_at"`
}

func NewNotesService() *NotesService {
	return &NotesService{
		db: database.DB,
	}
}

func (s *NotesService) GetNotes(userID string) ([]NoteResponse, error) {
	var notes []models.Note
	if err := s.db.Where("user_id = ?", userID).Order("created_at DESC").Find(&notes).Error; err != nil {
		return nil, err
	}

	response := make([]NoteResponse, len(notes))
	for i, note := range notes {
		var metadata map[string]any
		if len(note.Metadata) > 0 {
			_ = json.Unmarshal(note.Metadata, &metadata)
		}
		response[i] = NoteResponse{
			ID:          note.ID.String(),
			Content:     note.Content,
			SourceURL:   note.SourceURL,
			SourceTitle: note.SourceTitle,
			Metadata:    metadata,
			CreatedAt:   note.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:   note.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		}
	}

	return response, nil
}

func (s *NotesService) GetNoteByID(noteID, userID string) (*NoteResponse, error) {
	var note models.Note
	if err := s.db.Where("id = ? AND user_id = ?", noteID, userID).First(&note).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("note not found")
		}
		return nil, err
	}
	var metadata map[string]any
	if len(note.Metadata) > 0 {
		_ = json.Unmarshal(note.Metadata, &metadata)
	}
	response := &NoteResponse{
		ID:          note.ID.String(),
		Content:     note.Content,
		SourceURL:   note.SourceURL,
		SourceTitle: note.SourceTitle,
		Metadata:    metadata,
		CreatedAt:   note.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   note.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	return response, nil
}

func (s *NotesService) CreateNote(req *CreateNoteRequest, userID string) (*NoteResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, errors.New("invalid user ID")
	}
	var metadata datatypes.JSON
	if req.Metadata != nil {
		b, _ := json.Marshal(req.Metadata)
		metadata = datatypes.JSON(b)
	}
	note := models.Note{
		UserID:      userUUID,
		Content:     req.Content,
		SourceURL:   req.SourceURL,
		SourceTitle: req.SourceTitle,
		Metadata:    metadata,
	}
	if err := s.db.Create(&note).Error; err != nil {
		return nil, err
	}
	var respMetadata map[string]any
	if len(note.Metadata) > 0 {
		_ = json.Unmarshal(note.Metadata, &respMetadata)
	}
	response := &NoteResponse{
		ID:          note.ID.String(),
		Content:     note.Content,
		SourceURL:   note.SourceURL,
		SourceTitle: note.SourceTitle,
		Metadata:    respMetadata,
		CreatedAt:   note.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   note.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	return response, nil
}

func (s *NotesService) UpdateNote(noteID, userID string, req *UpdateNoteRequest) (*NoteResponse, error) {
	var note models.Note
	if err := s.db.Where("id = ? AND user_id = ?", noteID, userID).First(&note).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("note not found")
		}
		return nil, err
	}
	// Update fields if provided
	if req.Content != "" {
		note.Content = req.Content
	}
	if req.SourceURL != "" {
		note.SourceURL = req.SourceURL
	}
	if req.SourceTitle != "" {
		note.SourceTitle = req.SourceTitle
	}
	if req.Metadata != nil {
		b, _ := json.Marshal(req.Metadata)
		note.Metadata = datatypes.JSON(b)
	}
	if err := s.db.Save(&note).Error; err != nil {
		return nil, err
	}
	var respMetadata map[string]any
	if len(note.Metadata) > 0 {
		_ = json.Unmarshal(note.Metadata, &respMetadata)
	}
	response := &NoteResponse{
		ID:          note.ID.String(),
		Content:     note.Content,
		SourceURL:   note.SourceURL,
		SourceTitle: note.SourceTitle,
		Metadata:    respMetadata,
		CreatedAt:   note.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:   note.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	return response, nil
}

func (s *NotesService) DeleteNote(noteID, userID string) error {
	result := s.db.Where("id = ? AND user_id = ?", noteID, userID).Delete(&models.Note{})
	if result.Error != nil {
		return result.Error
	}

	if result.RowsAffected == 0 {
		return errors.New("note not found")
	}

	return nil
}
