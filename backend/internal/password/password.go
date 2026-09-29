// Package password hashes and verifies user credentials.
//
// Clients send a SHA-256 hex digest of the raw password. The server treats
// that digest as the secret and stores it with bcrypt, so a leaked database
// row can no longer be replayed as a login credential.
package password

import (
	"crypto/subtle"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// Cost is the bcrypt work factor. Tests lower it to keep runs fast.
var Cost = bcrypt.DefaultCost

// dummyHash is compared against when a user does not exist, so login timing
// does not reveal which emails are registered.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-secret"), bcrypt.DefaultCost)

// Hash returns the bcrypt hash of secret.
func Hash(secret string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(secret), Cost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// Verify reports whether secret matches stored. needsRehash is true when
// stored is a legacy value saved before bcrypt was introduced; callers should
// replace it with Hash(secret) after a successful match.
func Verify(stored, secret string) (ok, needsRehash bool) {
	if !isBcrypt(stored) {
		ok = subtle.ConstantTimeCompare([]byte(stored), []byte(secret)) == 1
		return ok, ok
	}
	return bcrypt.CompareHashAndPassword([]byte(stored), []byte(secret)) == nil, false
}

// SimulateVerify burns the same time as a real Verify. Use it when the user
// lookup fails.
func SimulateVerify(secret string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(secret))
}

func isBcrypt(s string) bool {
	return strings.HasPrefix(s, "$2a$") || strings.HasPrefix(s, "$2b$") || strings.HasPrefix(s, "$2y$")
}
