package handlers

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/middleware"
	"github.com/pratts/tts-study-assistant/backend/internal/respond"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
)

type NotesHandler struct {
	notes *services.NotesService
}

func NewNotesHandler(notes *services.NotesService) *NotesHandler {
	return &NotesHandler{notes: notes}
}

// GetNotes lists the caller's notes, newest first.
func (h *NotesHandler) GetNotes(c *fiber.Ctx) error {
	notes, err := h.notes.GetNotes(c.UserContext(), middleware.UserID(c), services.NotesQuery{
		Page:      c.QueryInt("page", 1),
		PageSize:  c.QueryInt("page_size", 10),
		SourceURL: c.Query("source_url"),
		Domain:    c.Query("domain"),
	})
	if err != nil {
		return serviceError(c, err, "Failed to fetch notes")
	}
	return respond.OK(c, "Notes fetched successfully", notes)
}

func (h *NotesHandler) GetNote(c *fiber.Ctx) error {
	noteID, ok := noteIDParam(c)
	if !ok {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid note ID")
	}
	note, err := h.notes.GetNote(c.UserContext(), middleware.UserID(c), noteID)
	if err != nil {
		return noteError(c, err, "Failed to fetch note")
	}
	return respond.OK(c, "Note fetched successfully", note)
}

func (h *NotesHandler) CreateNote(c *fiber.Ctx) error {
	var req services.CreateNoteRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.Content == "" {
		return respond.Error(c, fiber.StatusBadRequest, "Content is required")
	}
	if msg := noteFieldsError(req.Content, req.SourceURL, req.SourceTitle, req.Domain, req.Metadata); msg != "" {
		return respond.Error(c, fiber.StatusBadRequest, msg)
	}

	note, err := h.notes.CreateNote(c.UserContext(), middleware.UserID(c), &req)
	if err != nil {
		return serviceError(c, err, "Failed to create note")
	}
	return respond.OK(c, "Note created successfully", note)
}

// UpdateNote applies a partial update; omitted fields are left unchanged.
func (h *NotesHandler) UpdateNote(c *fiber.Ctx) error {
	noteID, ok := noteIDParam(c)
	if !ok {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid note ID")
	}
	var req services.UpdateNoteRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.Content != nil && *req.Content == "" {
		return respond.Error(c, fiber.StatusBadRequest, "Content cannot be empty")
	}
	if msg := noteFieldsError(deref(req.Content), deref(req.SourceURL), deref(req.SourceTitle), deref(req.Domain), req.Metadata); msg != "" {
		return respond.Error(c, fiber.StatusBadRequest, msg)
	}

	note, err := h.notes.UpdateNote(c.UserContext(), middleware.UserID(c), noteID, &req)
	if err != nil {
		return noteError(c, err, "Failed to update note")
	}
	return respond.OK(c, "Note updated successfully", note)
}

func (h *NotesHandler) DeleteNote(c *fiber.Ctx) error {
	noteID, ok := noteIDParam(c)
	if !ok {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid note ID")
	}
	if err := h.notes.DeleteNote(c.UserContext(), middleware.UserID(c), noteID); err != nil {
		return noteError(c, err, "Failed to delete note")
	}
	return respond.OK(c, "Note deleted successfully")
}

// GetNotesStats returns the number of notes per unique domain for the user
func (h *NotesHandler) GetNotesStats(c *fiber.Ctx) error {
	stats, err := h.notes.GetNotesStats(c.UserContext(), middleware.UserID(c))
	if err != nil {
		return serviceError(c, err, "Failed to fetch stats")
	}
	return respond.OK(c, "Notes stats fetched successfully", stats)
}

func (h *NotesHandler) SummarizeNote(c *fiber.Ctx) error {
	noteID, ok := noteIDParam(c)
	if !ok {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid note ID")
	}
	summary, err := h.notes.SummarizeNote(c.UserContext(), middleware.UserID(c), noteID)
	if err != nil {
		return noteError(c, err, "Failed to summarize note")
	}
	return respond.OK(c, "Note summarized successfully", fiber.Map{"summary": summary})
}

// noteError is serviceError plus 404 for missing notes.
func noteError(c *fiber.Ctx, err error, fallback string) error {
	if errors.Is(err, services.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "Note not found")
	}
	return serviceError(c, err, fallback)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
