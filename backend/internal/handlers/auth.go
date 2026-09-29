package handlers

import (
	"strings"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/pratts/tts-study-assistant/backend/internal/middleware"
	"github.com/pratts/tts-study-assistant/backend/internal/respond"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
)

type AuthHandler struct {
	auth  *services.AuthService
	users *services.UserService
}

func NewAuthHandler(auth *services.AuthService, users *services.UserService) *AuthHandler {
	return &AuthHandler{auth: auth, users: users}
}

// Register handles user registration
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req services.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Email == "" || req.Password == "" || req.Name == "" {
		return respond.Error(c, fiber.StatusBadRequest, "Email, password, and name are required")
	}
	email, ok := normalizeEmail(req.Email)
	if !ok {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid email address")
	}
	req.Email = email
	if !validPassword(req.Password) || utf8.RuneCountInString(req.Name) > maxNameRunes {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid password or name")
	}

	resp, err := h.auth.Register(c.UserContext(), &req)
	if err != nil {
		return serviceError(c, err, "Failed to register user")
	}
	return respond.OK(c, "User registered successfully", resp)
}

// Login handles user login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req services.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.Email == "" || req.Password == "" {
		return respond.Error(c, fiber.StatusBadRequest, "Email and password are required")
	}
	req.Email, _ = normalizeEmail(req.Email)
	if !validPassword(req.Password) {
		return respond.Error(c, fiber.StatusUnauthorized, "Invalid credentials")
	}

	resp, err := h.auth.Login(c.UserContext(), &req)
	if err != nil {
		return serviceError(c, err, "Failed to login")
	}
	return respond.OK(c, "Login successful", resp)
}

// Refresh rotates a refresh token and issues a new access token.
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req services.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.RefreshToken == "" {
		return respond.Error(c, fiber.StatusBadRequest, "Refresh token is required")
	}

	resp, err := h.auth.Refresh(c.UserContext(), req.RefreshToken)
	if err != nil {
		return serviceError(c, err, "Failed to refresh token")
	}
	return respond.OK(c, "Token refreshed successfully", resp)
}

// Logout revokes the given refresh token.
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var req services.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return respond.Error(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if req.RefreshToken == "" {
		return respond.Error(c, fiber.StatusBadRequest, "Refresh token is required")
	}

	if err := h.auth.Logout(c.UserContext(), req.RefreshToken); err != nil {
		return serviceError(c, err, "Failed to logout")
	}
	return respond.OK(c, "Logout successful")
}

// Verify returns the authenticated user. It returns a bare user object, not
// the usual envelope, because the extension depends on that shape.
func (h *AuthHandler) Verify(c *fiber.Ctx) error {
	profile, err := h.users.GetProfile(c.UserContext(), middleware.UserID(c))
	if err != nil {
		return respond.Error(c, fiber.StatusUnauthorized, "User not found", middleware.CodeTokenExpired)
	}
	return c.JSON(profile)
}
