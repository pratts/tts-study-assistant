package password

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func init() { Cost = bcrypt.MinCost }

func TestHashAndVerify(t *testing.T) {
	h, err := Hash("secret")
	require.NoError(t, err)
	assert.NotEqual(t, "secret", h)

	ok, rehash := Verify(h, "secret")
	assert.True(t, ok)
	assert.False(t, rehash)

	ok, _ = Verify(h, "wrong")
	assert.False(t, ok)
}

func TestHashIsSalted(t *testing.T) {
	a, _ := Hash("secret")
	b, _ := Hash("secret")
	assert.NotEqual(t, a, b)
}

func TestVerifyLegacy(t *testing.T) {
	legacy := "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b"

	ok, rehash := Verify(legacy, legacy)
	assert.True(t, ok)
	assert.True(t, rehash, "legacy match must request a rehash")

	ok, rehash = Verify(legacy, "other")
	assert.False(t, ok)
	assert.False(t, rehash)
}
