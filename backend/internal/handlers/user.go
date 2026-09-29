package handlers

import (
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/middleware"
	"github.com/pratts/tts-study-assistant/backend/internal/respond"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
)

type UserHandler struct {
	users *services.UserService
}

func NewUserHandler(users *services.UserService) *UserHandler {
	return &UserHandler{users: users}
}

func (h *UserHandler) GetProfile(c *fiber.Ctx) error {
	profile, err := h.users.GetProfile(c.UserContext(), middleware.UserID(c))
	if errors.Is(err, services.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "User not found")
	}
	if err != nil {
		return serviceError(c, err, "Failed to fetch profile")
	}
	return respond.OK(c, "Profile fetched successfully", profile)
}

func (h *UserHandler) UpdateProfile(c *fiber.Ctx) error {
	var req services.UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	req.Name = strings.TrimSpace(req.Name)
	if utf8.RuneCountInString(req.Name) > maxNameRunes {
		return respond.Error(c, fiber.StatusBadRequest, "Name is too long")
	}
	if req.Email != "" {
		email, ok := normalizeEmail(req.Email)
		if !ok {
			return respond.Error(c, fiber.StatusBadRequest, "Invalid email address")
		}
		req.Email = email
	}

	profile, err := h.users.UpdateProfile(c.UserContext(), middleware.UserID(c), &req)
	if errors.Is(err, services.ErrNotFound) {
		return respond.Error(c, fiber.StatusNotFound, "User not found")
	}
	if err != nil {
		return serviceError(c, err, "Failed to update profile")
	}
	return respond.OK(c, "Profile updated successfully", profile)
}

func (h *UserHandler) UpdatePassword(c *fiber.Ctx) error {
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		return respond.Error(c, fiber.StatusBadRequest, "Old and new password are required")
	}
	if !validPassword(req.OldPassword) || !validPassword(req.NewPassword) {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid password")
	}

	if err := h.users.UpdatePassword(c.UserContext(), middleware.UserID(c), req.OldPassword, req.NewPassword); err != nil {
		return serviceError(c, err, "Failed to update password")
	}
	return respond.OK(c, "Password updated successfully")
}
