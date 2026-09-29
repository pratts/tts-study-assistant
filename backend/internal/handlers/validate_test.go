package handlers

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeEmail(t *testing.T) {
	for in, want := range map[string]string{
		"  Alice@Example.COM ": "alice@example.com",
		"bob@example.com":      "bob@example.com",
	} {
		got, ok := normalizeEmail(in)
		assert.True(t, ok, in)
		assert.Equal(t, want, got)
	}
	for _, bad := range []string{"", "not-an-email", "Bob <bob@example.com>", "a@b@c", strings.Repeat("a", 250) + "@x.com"} {
		_, ok := normalizeEmail(bad)
		assert.False(t, ok, bad)
	}
}

func TestValidPassword(t *testing.T) {
	assert.True(t, validPassword(strings.Repeat("a", 64)))
	assert.False(t, validPassword(""))
	assert.False(t, validPassword(strings.Repeat("a", 73)), "bcrypt rejects > 72 bytes")
}

func TestNoteFieldsError(t *testing.T) {
	assert.Empty(t, noteFieldsError("content", "https://x.com", "title", "x.com"))
	assert.NotEmpty(t, noteFieldsError(strings.Repeat("é", MaxContentRunes+1), "", "", ""))
	assert.NotEmpty(t, noteFieldsError("", strings.Repeat("a", maxURLLen+1), "", ""))
	assert.NotEmpty(t, noteFieldsError("", "", strings.Repeat("a", maxTitleRunes+1), ""))
	assert.NotEmpty(t, noteFieldsError("", "", "", strings.Repeat("a", maxDomainLen+1)))
}
