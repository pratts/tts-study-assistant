package password

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func init() { Cost = bcrypt.MinCost }

func TestHashAndVerify(t *testing.T) {
	h, err := Hash("correct horse")
	require.NoError(t, err)
	assert.NotEqual(t, "correct horse", h)

	assert.True(t, Verify(h, "correct horse"))
	assert.False(t, Verify(h, "wrong"))
}

func TestHashIsSalted(t *testing.T) {
	a, _ := Hash("secret")
	b, _ := Hash("secret")
	assert.NotEqual(t, a, b)
}

func TestVerifyRejectsNonBcryptStoredValue(t *testing.T) {
	// A plaintext or pre-bcrypt value must never be treated as a match.
	assert.False(t, Verify("secret", "secret"))
}
