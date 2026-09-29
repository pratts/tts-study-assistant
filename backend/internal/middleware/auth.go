package middleware

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
	"github.com/pratts/tts-study-assistant/backend/pkg/utils"
)

// codeTokenExpired is returned for every auth failure. The web app and the
// extension refresh (or log out) only when they see this code, so it must not
// change without updating both clients.
const codeTokenExpired = "TOKEN_EXPIRED"

func AuthMiddleware(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tokenString, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
		if !ok || tokenString == "" {
			return utils.SendError(c, fiber.StatusUnauthorized, "Missing or invalid authorization header", codeTokenExpired)
		}

		claims, err := tokens.ParseAccess(cfg.JWTSecret, tokenString)
		if err != nil {
			msg := "Invalid token"
			if errors.Is(err, jwt.ErrTokenExpired) {
				msg = "Token expired"
			}
			return utils.SendError(c, fiber.StatusUnauthorized, msg, codeTokenExpired)
		}

		c.Locals("user_id", claims.UserID)
		c.Locals("email", claims.Email)
		return c.Next()
	}
}
