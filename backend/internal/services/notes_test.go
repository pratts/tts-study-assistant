package services

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func ptr(s string) *string { return &s }

func (e *env) createNote(t *testing.T, uid uuid.UUID, content string) uuid.UUID {
	t.Helper()
	n, err := e.notes.CreateNote(ctx, uid, &CreateNoteRequest{
		Content: content, SourceURL: "https://news.bbc.co.uk/post", SourceTitle: "Post",
		Metadata: json.RawMessage(`{"lang":"en"}`),
	})
	require.NoError(t, err)
	return uuid.MustParse(n.ID)
}

func TestCreateNote(t *testing.T) {
	e := newEnv(t)
	_, uid := e.register(t, "a@example.com")
	n, err := e.notes.CreateNote(ctx, uid, &CreateNoteRequest{
		Content: "hello", SourceURL: "https://news.bbc.co.uk/x", Metadata: json.RawMessage(`{"lang":"en"}`),
	})
	require.NoError(t, err)
	assert.Equal(t, "bbc.co.uk", n.Domain, "registrable domain via the public suffix list")
	assert.JSONEq(t, `{"lang":"en"}`, string(n.Metadata))
	assert.False(t, n.CreatedAt.IsZero())
}

func TestDomainOf(t *testing.T) {
	for in, want := range map[string]string{
		"https://news.bbc.co.uk/a":    "bbc.co.uk",
		"https://www.example.com/a":   "example.com",
		"https://example.com":         "example.com",
		"http://localhost:3000/x":     "localhost",
		"http://127.0.0.1/x":          "127.0.0.1",
		"https://user.github.io/page": "user.github.io",
	} {
		assert.Equal(t, want, domainOf(in), in)
	}
}

func TestGetNoteIsScopedToOwner(t *testing.T) {
	e := newEnv(t)
	_, owner := e.register(t, "owner@example.com")
	_, other := e.register(t, "other@example.com")
	id := e.createNote(t, owner, longText)

	_, err := e.notes.GetNote(ctx, other, id)
	assert.ErrorIs(t, err, ErrNotFound)
	assert.ErrorIs(t, e.notes.DeleteNote(ctx, other, id), ErrNotFound)
	_, err = e.notes.UpdateNote(ctx, other, id, &UpdateNoteRequest{Content: ptr("x")})
	assert.ErrorIs(t, err, ErrNotFound)

	n, err := e.notes.GetNote(ctx, owner, id)
	require.NoError(t, err)
	assert.Equal(t, longText, n.Content)
}

func TestGetNotesFiltersAndClampsPageSize(t *testing.T) {
	e := newEnv(t)
	_, uid := e.register(t, "a@example.com")
	notes := make([]models.Note, MaxPageSize+5)
	for i := range notes {
		notes[i] = models.Note{UserID: uid, Content: "note", Domain: "example.com"}
	}
	notes[0].Domain = "other.com"
	require.NoError(t, e.db.Create(&notes).Error)

	got, err := e.notes.GetNotes(ctx, uid, NotesQuery{Page: 1, PageSize: 1_000_000})
	require.NoError(t, err)
	assert.Len(t, got, MaxPageSize)

	got, err = e.notes.GetNotes(ctx, uid, NotesQuery{Domain: "other.com"})
	require.NoError(t, err)
	assert.Len(t, got, 1)

	stats, err := e.notes.GetNotesStats(ctx, uid)
	require.NoError(t, err)
	assert.Equal(t, []NotesStats{{"example.com", MaxPageSize + 4}, {"other.com", 1}}, stats)
}

func TestUpdateNotePartial(t *testing.T) {
	e := newEnv(t)
	_, uid := e.register(t, "a@example.com")
	id := e.createNote(t, uid, longText)
	require.NoError(t, e.db.Model(&models.Note{}).Where("id = ?", id).Update("summary", "kept").Error)

	n, err := e.notes.UpdateNote(ctx, uid, id, &UpdateNoteRequest{SourceTitle: ptr("Renamed")})
	require.NoError(t, err)
	assert.Equal(t, "Renamed", n.SourceTitle)
	assert.Equal(t, longText, n.Content)
	assert.Equal(t, "kept", n.Summary, "summary survives edits that don't touch content")
	assert.JSONEq(t, `{"lang":"en"}`, string(n.Metadata))

	n, err = e.notes.UpdateNote(ctx, uid, id, &UpdateNoteRequest{SourceURL: ptr(""), Metadata: json.RawMessage("null")})
	require.NoError(t, err)
	assert.Empty(t, n.SourceURL, "empty string clears a field")
	assert.Empty(t, n.Metadata, "null clears metadata")

	n, err = e.notes.UpdateNote(ctx, uid, id, &UpdateNoteRequest{Content: ptr("Brand new content for this note.")})
	require.NoError(t, err)
	assert.Empty(t, n.Summary, "changing content clears the stale summary")

	var stored models.Note
	require.NoError(t, e.db.First(&stored, "id = ?", id).Error)
	assert.Equal(t, "Renamed", stored.SourceTitle)
	assert.Empty(t, stored.Summary)
}

func TestSummarizeNoteStoresSummary(t *testing.T) {
	srv, _ := fakeOpenAI(t, http.StatusOK, "Go is simple.")
	e := newEnvWithSummarizer(t, NewSummarizerService("test-key", "m", srv.URL))
	_, uid := e.register(t, "a@example.com")
	id := e.createNote(t, uid, longText)

	summary, err := e.notes.SummarizeNote(ctx, uid, id)
	require.NoError(t, err)
	assert.Equal(t, "Go is simple.", summary)

	n, err := e.notes.GetNote(ctx, uid, id)
	require.NoError(t, err)
	assert.Equal(t, "Go is simple.", n.Summary)
}

func TestSummarizeNoteDoesNotRevertConcurrentEdit(t *testing.T) {
	var e *env
	var uid, id uuid.UUID
	edited := longText + " Edited while summarizing."

	// The fake OpenAI edits the note mid-request, like a user saving in another tab.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := e.notes.UpdateNote(ctx, uid, id, &UpdateNoteRequest{Content: &edited, SourceTitle: ptr("New title")})
		require.NoError(t, err)
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"content": "Summary of the old text."}}},
		})
	}))
	defer srv.Close()

	e = newEnvWithSummarizer(t, NewSummarizerService("test-key", "m", srv.URL))
	_, uid = e.register(t, "a@example.com")
	id = e.createNote(t, uid, longText)

	_, err := e.notes.SummarizeNote(ctx, uid, id)
	assert.ErrorIs(t, err, ErrNoteChanged)

	n, err := e.notes.GetNote(ctx, uid, id)
	require.NoError(t, err)
	assert.Equal(t, edited, n.Content, "edit must survive")
	assert.Equal(t, "New title", n.SourceTitle)
	assert.Empty(t, n.Summary, "summary of old content must not be stored")
}

func TestSummarizeNoteErrors(t *testing.T) {
	e := newEnv(t) // no API key
	_, uid := e.register(t, "a@example.com")
	id := e.createNote(t, uid, longText)

	_, err := e.notes.SummarizeNote(ctx, uid, id)
	assert.ErrorIs(t, err, ErrSummarizerDisabled)
	_, err = e.notes.SummarizeNote(ctx, uid, uuid.New())
	assert.ErrorIs(t, err, ErrNotFound)

	srv, _ := fakeOpenAI(t, http.StatusInternalServerError, "")
	e.notes.summarizer = NewSummarizerService("test-key", "m", srv.URL)
	_, err = e.notes.SummarizeNote(ctx, uid, id)
	assert.ErrorIs(t, err, ErrSummarizerUpstream)
}
