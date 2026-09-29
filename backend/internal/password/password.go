// Package password hashes and verifies user passwords with bcrypt.
//
// Clients send the raw password over HTTPS; only its bcrypt hash is stored.
package password

import "golang.org/x/crypto/bcrypt"

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

// Verify reports whether secret matches the stored bcrypt hash.
func Verify(stored, secret string) bool {
	return bcrypt.CompareHashAndPassword([]byte(stored), []byte(secret)) == nil
}

// SimulateVerify burns the same time as a real Verify. Use it when the user
// lookup fails.
func SimulateVerify(secret string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(secret))
}
