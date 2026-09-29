package handlers

import (
	"encoding/json"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// Input bounds. Passwords arrive as a 64-char SHA-256 hex digest; bcrypt
// rejects anything over 72 bytes.
const (
	MaxContentRunes = 100_000
	maxURLLen       = 2048
	maxTitleRunes   = 512
	maxDomainLen    = 253
	maxNameRunes    = 100
	maxPasswordLen  = 72
)

// normalizeEmail lower-cases and trims an email and reports whether it is a
// plain address (no display name).
func normalizeEmail(raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	addr, err := mail.ParseAddress(email)
	return email, err == nil && addr.Address == email && len(email) <= 254
}

func validPassword(p string) bool {
	return p != "" && len(p) <= maxPasswordLen
}

// noteIDParam returns the :id path parameter if it is a valid UUID.
func noteIDParam(c *fiber.Ctx) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Params("id"))
	return id, err == nil
}

// noteFieldsError returns a message describing the first invalid field, or
// "" when all fields are valid. Metadata, when present, must be a JSON object
// or null.
func noteFieldsError(content, sourceURL, sourceTitle, domain string, metadata json.RawMessage) string {
	switch {
	case len(metadata) > 0 && string(metadata) != "null" && (metadata[0] != '{' || !json.Valid(metadata)):
		return "Metadata must be a JSON object"
	case utf8.RuneCountInString(content) > MaxContentRunes:
		return "Content is too long"
	case len(sourceURL) > maxURLLen:
		return "Source URL is too long"
	case utf8.RuneCountInString(sourceTitle) > maxTitleRunes:
		return "Source title is too long"
	case len(domain) > maxDomainLen:
		return "Domain is too long"
	}
	return ""
}
