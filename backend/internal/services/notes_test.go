package services

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func createNote(t *testing.T, userID, content string) *NoteResponse {
	t.Helper()
	n, err := NewNotesService().CreateNote(&CreateNoteRequest{
		Content: content, SourceURL: "https://blog.example.com/post", SourceTitle: "Post",
	}, userID)
	require.NoError(t, err)
	return n
}

func TestSummarizeNoteStoresSummary(t *testing.T) {
	db := setupDB(t)
	user := register(t, NewAuthService(testConfig), "a@example.com")
	note := createNote(t, user.User.ID, longText)
	srv, _ := fakeOpenAI(t, http.StatusOK, "Go is simple.")

	summary, err := NewNotesService().SummarizeNote(context.Background(), note.ID, user.User.ID,
		NewSummarizerService("test-key", "m", srv.URL))
	require.NoError(t, err)
	assert.Equal(t, "Go is simple.", summary)

	var stored models.Note
	require.NoError(t, db.First(&stored, "id = ?", note.ID).Error)
	assert.Equal(t, "Go is simple.", stored.Summary)
}

func TestSummarizeNoteDoesNotRevertConcurrentEdit(t *testing.T) {
	db := setupDB(t)
	user := register(t, NewAuthService(testConfig), "a@example.com")
	note := createNote(t, user.User.ID, longText)
	edited := longText + " Edited while summarizing."

	// The fake OpenAI edits the note mid-request, like a user saving in another tab.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := NewNotesService().UpdateNote(note.ID, user.User.ID, &UpdateNoteRequest{Content: edited, SourceTitle: "New title"})
		require.NoError(t, err)
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"content": "Summary of the old text."}}},
		})
	}))
	defer srv.Close()

	_, err := NewNotesService().SummarizeNote(context.Background(), note.ID, user.User.ID,
		NewSummarizerService("test-key", "m", srv.URL))
	assert.EqualError(t, err, "note changed during summarization")

	var stored models.Note
	require.NoError(t, db.First(&stored, "id = ?", note.ID).Error)
	assert.Equal(t, edited, stored.Content, "edit must survive")
	assert.Equal(t, "New title", stored.SourceTitle)
	assert.Empty(t, stored.Summary, "summary of old content must not be stored")
}

func TestSummarizeNoteOtherUsersNote(t *testing.T) {
	setupDB(t)
	auth := NewAuthService(testConfig)
	owner := register(t, auth, "owner@example.com")
	other := register(t, auth, "other@example.com")
	note := createNote(t, owner.User.ID, longText)

	_, err := NewNotesService().SummarizeNote(context.Background(), note.ID, other.User.ID,
		NewSummarizerService("test-key", "m", "http://127.0.0.1:1"))
	assert.EqualError(t, err, "note not found")
}

func TestUpdateNoteWritesOnlyProvidedColumns(t *testing.T) {
	db := setupDB(t)
	user := register(t, NewAuthService(testConfig), "a@example.com")
	note := createNote(t, user.User.ID, longText)
	require.NoError(t, db.Model(&models.Note{}).Where("id = ?", note.ID).Update("summary", "kept").Error)

	_, err := NewNotesService().UpdateNote(note.ID, user.User.ID, &UpdateNoteRequest{SourceTitle: "Renamed"})
	require.NoError(t, err)

	var stored models.Note
	require.NoError(t, db.First(&stored, "id = ?", note.ID).Error)
	assert.Equal(t, "Renamed", stored.SourceTitle)
	assert.Equal(t, longText, stored.Content)
	assert.Equal(t, "kept", stored.Summary, "summary survives edits that don't touch content")

	_, err = NewNotesService().UpdateNote(note.ID, user.User.ID, &UpdateNoteRequest{Content: "Brand new content for this note."})
	require.NoError(t, err)
	require.NoError(t, db.First(&stored, "id = ?", note.ID).Error)
	assert.Empty(t, stored.Summary, "changing content clears the stale summary")
}

func TestGetNotesClampsPageSize(t *testing.T) {
	db := setupDB(t)
	user := register(t, NewAuthService(testConfig), "a@example.com")
	uid := uuid.MustParse(user.User.ID)
	notes := make([]models.Note, MaxPageSize+5)
	for i := range notes {
		notes[i] = models.Note{UserID: uid, Content: "note"}
	}
	require.NoError(t, db.Create(&notes).Error)

	got, err := NewNotesService().GetNotes(user.User.ID, 1, 1_000_000, "", "")
	require.NoError(t, err)
	assert.Len(t, got, MaxPageSize)
}
