package middleware

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/respond"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
)

// CodeTokenExpired is returned for every auth failure. The web app and the
// extension refresh (or log out) only when they see this code, so it must not
// change without updating both clients.
const CodeTokenExpired = "TOKEN_EXPIRED"

type ctxKey int

const userIDKey ctxKey = iota

// Auth rejects requests without a valid access token and stores the caller's
// ID for UserID.
func Auth(jwtSecret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tokenString, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
		if !ok || tokenString == "" {
			return respond.Error(c, fiber.StatusUnauthorized, "Missing or invalid authorization header", CodeTokenExpired)
		}

		claims, err := tokens.ParseAccess(jwtSecret, tokenString)
		if err != nil {
			msg := "Invalid token"
			if errors.Is(err, jwt.ErrTokenExpired) {
				msg = "Token expired"
			}
			return respond.Error(c, fiber.StatusUnauthorized, msg, CodeTokenExpired)
		}
		userID, err := uuid.Parse(claims.UserID)
		if err != nil {
			return respond.Error(c, fiber.StatusUnauthorized, "Invalid token", CodeTokenExpired)
		}

		c.Locals(userIDKey, userID)
		return c.Next()
	}
}

// UserID returns the authenticated user's ID. It must only be called from
// handlers behind Auth.
func UserID(c *fiber.Ctx) uuid.UUID {
	return c.Locals(userIDKey).(uuid.UUID)
}
