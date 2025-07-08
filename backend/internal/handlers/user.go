package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
	"github.com/pratts/tts-study-assistant/backend/pkg/utils"
)

type UserHandler struct {
	userService *services.UserService
}

func NewUserHandler() *UserHandler {
	return &UserHandler{
		userService: services.NewUserService(),
	}
}

// GetProfile handles getting user profile
func (h *UserHandler) GetProfile(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)

	profile, err := h.userService.GetProfile(userID)
	if err != nil {
		if err.Error() == "user not found" {
			return utils.SendError(c, fiber.StatusNotFound, "User not found")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to fetch profile")
	}

	return utils.SendSuccess(c, "Profile fetched successfully", profile)
}

// UpdateProfile handles updating user profile
func (h *UserHandler) UpdateProfile(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	var req services.UpdateProfileRequest

	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	profile, err := h.userService.UpdateProfile(userID, &req)
	if err != nil {
		if err.Error() == "user not found" {
			return utils.SendError(c, fiber.StatusNotFound, "User not found")
		}
		if err.Error() == "email already taken" {
			return utils.SendError(c, fiber.StatusConflict, "Email already taken")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to update profile")
	}

	return utils.SendSuccess(c, "Profile updated successfully", profile)
}

// UpdatePassword handles updating user password
func (h *UserHandler) UpdatePassword(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(string)
	var req struct {
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.OldPassword == "" || req.NewPassword == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Old and new password are required")
	}
	if err := h.userService.UpdatePassword(userID, req.OldPassword, req.NewPassword); err != nil {
		if err.Error() == "incorrect password" {
			return utils.SendError(c, fiber.StatusUnauthorized, "Incorrect old password")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to update password")
	}
	return utils.SendSuccess(c, "Password updated successfully")
}
