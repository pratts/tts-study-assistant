package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/pkg/utils"
)

type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

func AuthMiddleware(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return utils.SendErrorWithCode(c, fiber.StatusUnauthorized, "Authorization header required", "TOKEN_EXPIRED")
		}

		// Check if the header starts with "Bearer "
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return utils.SendErrorWithCode(c, fiber.StatusUnauthorized, "Invalid authorization header format", "TOKEN_EXPIRED")
		}

		// Extract the token
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// Parse and validate the token
		token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil {
			if strings.Contains(err.Error(), "token is expired") {
				return utils.SendErrorWithCode(c, fiber.StatusUnauthorized, "Token expired", "TOKEN_EXPIRED")
			}
			return utils.SendErrorWithCode(c, fiber.StatusUnauthorized, "Invalid or expired token", "TOKEN_EXPIRED")
		}
		if !token.Valid {
			return utils.SendErrorWithCode(c, fiber.StatusUnauthorized, "Invalid or expired token", "TOKEN_EXPIRED")
		}

		// Extract claims
		claims, ok := token.Claims.(*Claims)
		if !ok {
			return utils.SendErrorWithCode(c, fiber.StatusUnauthorized, "Invalid token claims", "TOKEN_EXPIRED")
		}

		// Set user info in context
		c.Locals("user_id", claims.UserID)
		c.Locals("email", claims.Email)

		return c.Next()
	}
}
