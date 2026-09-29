// Package tokens issues and validates access and refresh tokens.
package tokens

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const issuer = "tts-study-assistant"

// Sources a session can be issued for. The server, not the client, decides
// token lifetimes; unknown values fall back to SourceWeb.
const (
	SourceWeb       = "web"
	SourceExtension = "extension"
)

// Claims are the JWT claims of an access token.
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// NormalizeSource maps a client-supplied source to a known one.
func NormalizeSource(source string) string {
	if source == SourceExtension {
		return SourceExtension
	}
	return SourceWeb
}

// AccessTTL returns the access token lifetime for a source.
func AccessTTL(source string) time.Duration {
	if source == SourceExtension {
		return time.Hour
	}
	return 15 * time.Minute
}

// RefreshTTL returns the refresh token lifetime for a source.
func RefreshTTL(source string) time.Duration {
	if source == SourceExtension {
		return 90 * 24 * time.Hour
	}
	return 30 * 24 * time.Hour
}

// IssueAccess signs an HS256 access token.
func IssueAccess(secret, userID, email, source string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTTL(source))),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// ParseAccess validates an access token. Expired tokens return an error
// matching jwt.ErrTokenExpired.
func ParseAccess(secret, tokenString string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenString, claims,
		func(*jwt.Token) (any, error) { return []byte(secret), nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// NewRefresh returns a random refresh token and the hash to store for it.
func NewRefresh() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, HashRefresh(raw), nil
}

// HashRefresh returns the value stored for a refresh token. Tokens carry 256
// bits of entropy, so an unsalted SHA-256 is sufficient.
func HashRefresh(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
