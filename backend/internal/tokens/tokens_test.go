package tokens

import (
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const secret = "test-secret"

func TestIssueAndParseAccess(t *testing.T) {
	tok, err := IssueAccess(secret, "user-1", "a@example.com", SourceWeb)
	require.NoError(t, err)

	claims, err := ParseAccess(secret, tok)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.UserID)
	assert.Equal(t, "a@example.com", claims.Email)
	assert.WithinDuration(t, time.Now().Add(15*time.Minute), claims.ExpiresAt.Time, 5*time.Second)
}

func TestParseAccessRejectsWrongSecret(t *testing.T) {
	tok, _ := IssueAccess(secret, "user-1", "a@example.com", SourceWeb)
	_, err := ParseAccess("other", tok)
	assert.Error(t, err)
}

func TestParseAccessRejectsOtherAlgorithms(t *testing.T) {
	claims := Claims{UserID: "user-1", RegisteredClaims: jwt.RegisteredClaims{
		Issuer: issuer, ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString([]byte(secret))
	require.NoError(t, err)
	_, err = ParseAccess(secret, tok)
	assert.Error(t, err)

	none, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)
	_, err = ParseAccess(secret, none)
	assert.Error(t, err)
}

func TestParseAccessExpired(t *testing.T) {
	claims := Claims{UserID: "user-1", RegisteredClaims: jwt.RegisteredClaims{
		Issuer: issuer, ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
	}}
	tok, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	_, err := ParseAccess(secret, tok)
	assert.True(t, errors.Is(err, jwt.ErrTokenExpired))
}

func TestNormalizeSourceAndTTL(t *testing.T) {
	assert.Equal(t, SourceWeb, NormalizeSource(""))
	assert.Equal(t, SourceWeb, NormalizeSource("admin-forever"))
	assert.Equal(t, SourceExtension, NormalizeSource("extension"))
	assert.Equal(t, time.Hour, AccessTTL(SourceExtension))
	assert.Equal(t, 90*24*time.Hour, RefreshTTL(SourceExtension))
	assert.Equal(t, 30*24*time.Hour, RefreshTTL(SourceWeb))
}

func TestNewRefresh(t *testing.T) {
	raw, hash, err := NewRefresh()
	require.NoError(t, err)
	assert.Len(t, hash, 64)
	assert.Equal(t, hash, HashRefresh(raw))
	assert.NotEqual(t, raw, hash)

	raw2, _, _ := NewRefresh()
	assert.NotEqual(t, raw, raw2)
}
