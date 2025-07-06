package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
	"github.com/pratts/tts-study-assistant/backend/pkg/utils"
)

type AuthHandler struct {
	authService *services.AuthService
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		authService: services.NewAuthService(cfg),
	}
}

// Register handles user registration
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req services.RegisterRequest

	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	// Basic validation
	if req.Email == "" || req.Password == "" || req.Name == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Email, password, and name are required")
	}

	response, err := h.authService.Register(&req)
	if err != nil {
		if err.Error() == "user already exists" {
			return utils.SendError(c, fiber.StatusConflict, "User already exists")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to register user")
	}

	return utils.SendSuccess(c, "User registered successfully", response)
}

// Login handles user login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req services.LoginRequest

	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	// Basic validation
	if req.Email == "" || req.Password == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Email and password are required")
	}

	response, err := h.authService.Login(&req)
	if err != nil {
		if err.Error() == "invalid credentials" {
			return utils.SendError(c, fiber.StatusUnauthorized, "Invalid credentials")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to login")
	}

	return utils.SendSuccess(c, "Login successful", response)
}

// Refresh handles token refresh
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req services.RefreshRequest

	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if req.RefreshToken == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Refresh token is required")
	}

	response, err := h.authService.Refresh(&req)
	if err != nil {
		if err.Error() == "invalid refresh token" {
			return utils.SendError(c, fiber.StatusUnauthorized, "Invalid refresh token")
		}
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to refresh token")
	}

	return utils.SendSuccess(c, "Token refreshed successfully", response)
}

// Logout handles user logout
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := c.BodyParser(&req); err != nil {
		return utils.SendError(c, fiber.StatusBadRequest, "Invalid request body")
	}

	if req.RefreshToken == "" {
		return utils.SendError(c, fiber.StatusBadRequest, "Refresh token is required")
	}

	if err := h.authService.Logout(req.RefreshToken); err != nil {
		return utils.SendError(c, fiber.StatusInternalServerError, "Failed to logout")
	}

	return utils.SendSuccess(c, "Logout successful")
}
