package handlers

import (
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/respond"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
)

// serviceError maps a service error to a response. Unknown errors are logged
// and returned as 500 with fallback as the message, so internals never leak.
func serviceError(c *fiber.Ctx, err error, fallback string) error {
	switch {
	case errors.Is(err, services.ErrUserExists):
		return respond.Error(c, fiber.StatusConflict, "User already exists")
	case errors.Is(err, services.ErrEmailTaken):
		return respond.Error(c, fiber.StatusConflict, "Email already taken")
	case errors.Is(err, services.ErrInvalidCredentials):
		return respond.Error(c, fiber.StatusUnauthorized, "Invalid credentials")
	case errors.Is(err, services.ErrIncorrectPassword):
		// 403, not 401: on authenticated routes a 401 always means the
		// session is invalid, and clients end the session on it.
		return respond.Error(c, fiber.StatusForbidden, "Incorrect old password")
	case errors.Is(err, services.ErrInvalidRefreshToken):
		return respond.Error(c, fiber.StatusUnauthorized, "Invalid refresh token")
	case errors.Is(err, services.ErrNoteChanged):
		return respond.Error(c, fiber.StatusConflict, "Note changed during summarization, please retry")
	case errors.Is(err, services.ErrSummarizerDisabled):
		return respond.Error(c, fiber.StatusServiceUnavailable, "Summarization is not configured")
	case errors.Is(err, services.ErrSummarizerUpstream):
		slog.Error("summarizer upstream failed", "err", err)
		return respond.Error(c, fiber.StatusBadGateway, fallback)
	}
	slog.Error(fallback, "method", c.Method(), "path", c.Path(), "err", err)
	return respond.Error(c, fiber.StatusInternalServerError, fallback)
}
