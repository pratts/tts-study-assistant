package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
	"github.com/pratts/tts-study-assistant/backend/pkg/utils"
)

type NotesHandler struct {
	notesService *services.NotesService
}

func NewNotesHandler() *NotesHandler {
	return &NotesHandler{
		notesService: services.NewNotesService(),
	}
}

// GetNotes handles getting all notes for a user
func (h *NotesHandler) GetNotes(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)

	// Parse pagination and filter params
	page := c.QueryInt("page", 1)
	pageSize := c.QueryInt("page_size", 10)
	sourceURL := c.Query("source_url", "")
	domain := c.Query("domain", "")

	notes, err := h.notesService.GetNotes(userID, page, pageSize, sourceURL, domain)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to fetch notes")
	}

	return utils.SendSuccess(c, "Notes fetched successfully", notes)
}

// GetNote handles getting a specific note by ID
func (h *NotesHandler) GetNote(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	noteID := c.Params("id")

	if noteID == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Note ID is required")
	}

	note, err := h.notesService.GetNoteByID(noteID, userID)
	if err != nil {
		if err.Error() == "note not found" {
			return utils.SendError(c, fiber.StatusNotFound, "Note not found")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to fetch note")
	}

	return utils.SendSuccess(c, "Note fetched successfully", note)
}

// CreateNote handles creating a new note
func (h *NotesHandler) CreateNote(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	var req services.CreateNoteRequest

	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if req.Content == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Content is required")
	}

	note, err := h.notesService.CreateNote(&req, userID)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to create note")
	}

	return utils.SendSuccess(c, "Note created successfully", note)
}

// UpdateNote handles updating an existing note
func (h *NotesHandler) UpdateNote(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	noteID := c.Params("id")
	var req services.UpdateNoteRequest

	if noteID == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Note ID is required")
	}

	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	note, err := h.notesService.UpdateNote(noteID, userID, &req)
	if err != nil {
		if err.Error() == "note not found" {
			return utils.SendError(c, fiber.StatusNotFound, "Note not found")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to update note")
	}

	return utils.SendSuccess(c, "Note updated successfully", note)
}

// DeleteNote handles deleting a note
func (h *NotesHandler) DeleteNote(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	noteID := c.Params("id")

	if noteID == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Note ID is required")
	}

	err := h.notesService.DeleteNote(noteID, userID)
	if err != nil {
		if err.Error() == "note not found" {
			return utils.SendError(c, fiber.StatusNotFound, "Note not found")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to delete note")
	}

	return utils.SendSuccess(c, "Note deleted successfully")
}

// GetNotesStats returns the number of notes per unique domain for the user
func (h *NotesHandler) GetNotesStats(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	stats, err := h.notesService.GetNotesStats(userID)
	if err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to fetch stats")
	}
	return utils.SendSuccess(c, "Notes stats fetched successfully", stats)
}
