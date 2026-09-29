package services

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const longText = "Go is a statically typed, compiled language designed at Google for simplicity and performance."

// fakeOpenAI returns a server that answers every completion with reply.
func fakeOpenAI(t *testing.T, status int, reply string) (*httptest.Server, *chatRequest) {
	t.Helper()
	var got chatRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/chat/completions", r.URL.Path)
		assert.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&got))
		w.WriteHeader(status)
		if status != http.StatusOK {
			w.Write([]byte(`{"error":"boom"}`))
			return
		}
		json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"role": "assistant", "content": reply}}},
		})
	}))
	t.Cleanup(srv.Close)
	return srv, &got
}

func TestSummarize(t *testing.T) {
	srv, got := fakeOpenAI(t, http.StatusOK, "  Go is simple.  ")
	s := NewSummarizerService("test-key", "test-model", srv.URL+"/")

	summary, err := s.Summarize(context.Background(), longText)
	require.NoError(t, err)
	assert.Equal(t, "Go is simple.", summary, "short valid summaries must be kept")
	assert.Equal(t, "test-model", got.Model)
	assert.Zero(t, got.Temperature)
	assert.Equal(t, longText, got.Messages[1].Content)
}

func TestSummarizeUnavailable(t *testing.T) {
	for _, reply := range []string{
		"unavailable",
		"Unavailable.",
		"",
		"The text is TOO SHORT to summarize.",
		"Please provide more context.",
	} {
		srv, _ := fakeOpenAI(t, http.StatusOK, reply)
		s := NewSummarizerService("test-key", "m", srv.URL)
		summary, err := s.Summarize(context.Background(), longText)
		require.NoError(t, err, reply)
		assert.Equal(t, SummaryUnavailable, summary, reply)
	}
}

func TestSummarizeLongReplyWithPhraseIsKept(t *testing.T) {
	reply := "The article argues that release cycles that are too short hurt quality, and recommends a steady cadence with automated checks."
	srv, _ := fakeOpenAI(t, http.StatusOK, reply)
	summary, err := NewSummarizerService("test-key", "m", srv.URL).Summarize(context.Background(), longText)
	require.NoError(t, err)
	assert.Equal(t, reply, summary)
}

func TestSummarizeShortInputSkipsAPI(t *testing.T) {
	s := NewSummarizerService("test-key", "m", "http://127.0.0.1:1") // unreachable on purpose
	summary, err := s.Summarize(context.Background(), "  héllo wörld  ")
	require.NoError(t, err)
	assert.Equal(t, SummaryUnavailable, summary)
}

func TestSummarizeDisabledWithoutKey(t *testing.T) {
	_, err := NewSummarizerService("", "m", "http://127.0.0.1:1").Summarize(context.Background(), longText)
	assert.ErrorIs(t, err, ErrSummarizerDisabled)
}

func TestSummarizeUpstreamError(t *testing.T) {
	srv, _ := fakeOpenAI(t, http.StatusTooManyRequests, "")
	_, err := NewSummarizerService("test-key", "m", srv.URL).Summarize(context.Background(), longText)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "429")
}

func TestSummarizeHonoursContext(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body) // disconnects are only detected once the body is read
		<-r.Context().Done()
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := NewSummarizerService("test-key", "m", srv.URL).Summarize(ctx, longText)
	require.Error(t, err)
	assert.Less(t, time.Since(start), 5*time.Second)
	assert.True(t, strings.Contains(err.Error(), "deadline"), err.Error())
}
