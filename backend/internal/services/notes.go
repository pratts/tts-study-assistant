package services

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/url"
	"time"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"golang.org/x/net/publicsuffix"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// MaxPageSize caps how many notes a single list request returns.
const MaxPageSize = 100

type NotesService struct {
	db         *gorm.DB
	summarizer *SummarizerService
}

type CreateNoteRequest struct {
	Content     string          `json:"content"`
	SourceURL   string          `json:"source_url,omitempty"`
	SourceTitle string          `json:"source_title,omitempty"`
	Domain      string          `json:"domain,omitempty"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
}

// UpdateNoteRequest is a partial update: nil fields are left unchanged, and
// an empty string clears the field. Metadata `null` clears it.
type UpdateNoteRequest struct {
	Content     *string         `json:"content"`
	SourceURL   *string         `json:"source_url"`
	SourceTitle *string         `json:"source_title"`
	Domain      *string         `json:"domain"`
	Metadata    json.RawMessage `json:"metadata"`
}

type NoteResponse struct {
	ID          string         `json:"id"`
	Content     string         `json:"content"`
	SourceURL   string         `json:"source_url,omitempty"`
	SourceTitle string         `json:"source_title,omitempty"`
	Domain      string         `json:"domain,omitempty"`
	Metadata    datatypes.JSON `json:"metadata,omitempty"`
	Summary     string         `json:"summary,omitempty"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

type NotesQuery struct {
	Page      int
	PageSize  int
	SourceURL string
	Domain    string
}

type NotesStats struct {
	Domain string `json:"domain"`
	Count  int    `json:"count"`
}

func NewNotesService(db *gorm.DB, summarizer *SummarizerService) *NotesService {
	return &NotesService{db: db, summarizer: summarizer}
}

func toNoteResponse(n *models.Note) NoteResponse {
	return NoteResponse{
		ID:          n.ID.String(),
		Content:     n.Content,
		SourceURL:   n.SourceURL,
		SourceTitle: n.SourceTitle,
		Domain:      n.Domain,
		Metadata:    n.Metadata,
		Summary:     n.Summary,
		CreatedAt:   n.CreatedAt,
		UpdatedAt:   n.UpdatedAt,
	}
}

// domainOf returns the registrable domain of rawURL (bbc.co.uk for
// news.bbc.co.uk), or its host when there is none (localhost, IPs).
func domainOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	host := u.Hostname()
	if net.ParseIP(host) != nil {
		return host
	}
	if d, err := publicsuffix.EffectiveTLDPlusOne(host); err == nil {
		return d
	}
	return host
}

// metadataValue converts request metadata to a column value; JSON null or
// an absent field become nil.
func metadataValue(raw json.RawMessage) datatypes.JSON {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return datatypes.JSON(raw)
}

func (s *NotesService) find(db *gorm.DB, userID, noteID uuid.UUID) (*models.Note, error) {
	var note models.Note
	if err := db.First(&note, "id = ? AND user_id = ?", noteID, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &note, nil
}

func (s *NotesService) GetNotes(ctx context.Context, userID uuid.UUID, q NotesQuery) ([]NoteResponse, error) {
	db := s.db.WithContext(ctx).Where("user_id = ?", userID)
	if q.SourceURL != "" {
		db = db.Where("source_url = ?", q.SourceURL)
	}
	if q.Domain != "" {
		db = db.Where("domain = ?", q.Domain)
	}
	page := max(q.Page, 1)
	pageSize := q.PageSize
	if pageSize < 1 {
		pageSize = 10
	}
	pageSize = min(pageSize, MaxPageSize)

	var notes []models.Note
	if err := db.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&notes).Error; err != nil {
		return nil, err
	}

	resp := make([]NoteResponse, len(notes))
	for i := range notes {
		resp[i] = toNoteResponse(&notes[i])
	}
	return resp, nil
}

func (s *NotesService) GetNote(ctx context.Context, userID, noteID uuid.UUID) (*NoteResponse, error) {
	note, err := s.find(s.db.WithContext(ctx), userID, noteID)
	if err != nil {
		return nil, err
	}
	resp := toNoteResponse(note)
	return &resp, nil
}

func (s *NotesService) CreateNote(ctx context.Context, userID uuid.UUID, req *CreateNoteRequest) (*NoteResponse, error) {
	domain := req.Domain
	if domain == "" && req.SourceURL != "" {
		domain = domainOf(req.SourceURL)
	}
	note := models.Note{
		UserID:      userID,
		Content:     req.Content,
		SourceURL:   req.SourceURL,
		SourceTitle: req.SourceTitle,
		Domain:      domain,
		Metadata:    metadataValue(req.Metadata),
	}
	if err := s.db.WithContext(ctx).Create(&note).Error; err != nil {
		return nil, err
	}
	resp := toNoteResponse(&note)
	return &resp, nil
}

// UpdateNote writes only the provided columns so a concurrent summarize (or
// another edit) of a different column is not overwritten.
func (s *NotesService) UpdateNote(ctx context.Context, userID, noteID uuid.UUID, req *UpdateNoteRequest) (*NoteResponse, error) {
	db := s.db.WithContext(ctx)
	note, err := s.find(db, userID, noteID)
	if err != nil {
		return nil, err
	}

	changes := map[string]any{}
	if req.Content != nil && *req.Content != note.Content {
		changes["content"] = *req.Content
		changes["summary"] = "" // the old summary no longer matches
	}
	if req.SourceURL != nil {
		changes["source_url"] = *req.SourceURL
	}
	if req.SourceTitle != nil {
		changes["source_title"] = *req.SourceTitle
	}
	if req.Domain != nil {
		changes["domain"] = *req.Domain
	}
	if len(req.Metadata) > 0 {
		changes["metadata"] = metadataValue(req.Metadata)
	}
	if len(changes) > 0 {
		if err := db.Model(note).Clauses(clause.Returning{}).Updates(changes).Error; err != nil {
			return nil, err
		}
	}
	resp := toNoteResponse(note)
	return &resp, nil
}

func (s *NotesService) DeleteNote(ctx context.Context, userID, noteID uuid.UUID) error {
	res := s.db.WithContext(ctx).Where("id = ? AND user_id = ?", noteID, userID).Delete(&models.Note{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// GetNotesStats returns the number of notes per domain, most frequent first.
func (s *NotesService) GetNotesStats(ctx context.Context, userID uuid.UUID) ([]NotesStats, error) {
	stats := []NotesStats{}
	err := s.db.WithContext(ctx).Model(&models.Note{}).
		Select("domain, COUNT(*) AS count").
		Where("user_id = ?", userID).
		Group("domain").
		Order("count DESC").
		Scan(&stats).Error
	return stats, err
}

// SummarizeNote summarizes a note's content and saves the summary. Only the
// summary column is written, and only if the content is unchanged: the
// OpenAI call takes seconds, and a full-row save would revert edits made in
// the meantime.
func (s *NotesService) SummarizeNote(ctx context.Context, userID, noteID uuid.UUID) (string, error) {
	db := s.db.WithContext(ctx)
	note, err := s.find(db, userID, noteID)
	if err != nil {
		return "", err
	}
	summary, err := s.summarizer.Summarize(ctx, note.Content)
	if err != nil {
		return "", err
	}
	res := db.Model(&models.Note{}).
		Where("id = ? AND user_id = ? AND content = ?", noteID, userID, note.Content).
		Update("summary", summary)
	if res.Error != nil {
		return "", res.Error
	}
	if res.RowsAffected == 0 {
		return "", ErrNoteChanged
	}
	return summary, nil
}
