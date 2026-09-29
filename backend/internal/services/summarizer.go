package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// SummaryUnavailable is returned (and stored) when the text is too short or
// incomplete to summarize. The web app and extension check for this value.
const SummaryUnavailable = "unavailable"

const (
	minSummaryInputRunes = 20
	summarizerTimeout    = 30 * time.Second
	systemPrompt         = "You are a helpful assistant that creates concise summaries. Summarize the following text in 2-3 sentences, capturing the key points. If the text is too short, incomplete, or lacks sufficient content for meaningful summarization, respond with exactly 'unavailable' (no quotes, no additional text)."
)

// refusalPhrases catch short replies where the model explains that it cannot
// summarize instead of answering with SummaryUnavailable.
var refusalPhrases = []string{
	"text appears to be cut-off",
	"please provide more context",
	"insufficient content",
	"too short",
	"cannot create",
	"need more information",
}

type SummarizerService struct {
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// NewSummarizerService returns a summarizer for the OpenAI chat completions
// API at baseURL (e.g. https://api.openai.com/v1).
func NewSummarizerService(apiKey, model, baseURL string) *SummarizerService {
	return &SummarizerService{
		apiKey:  apiKey,
		model:   model,
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: summarizerTimeout},
	}
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

// Summarize returns a 2-3 sentence summary of text, or SummaryUnavailable
// when the text is not suitable for summarization.
func (s *SummarizerService) Summarize(ctx context.Context, text string) (string, error) {
	if s.apiKey == "" {
		return "", ErrSummarizerDisabled
	}
	if utf8.RuneCountInString(strings.TrimSpace(text)) < minSummaryInputRunes {
		return SummaryUnavailable, nil
	}

	body, err := json.Marshal(chatRequest{
		Model: s.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: text},
		},
		Temperature: 0,
		MaxTokens:   150,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrSummarizerUpstream, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", fmt.Errorf("%w: status %d: %s", ErrSummarizerUpstream, resp.StatusCode, msg)
	}

	var result chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("%w: decode response: %w", ErrSummarizerUpstream, err)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("%w: no choices returned", ErrSummarizerUpstream)
	}

	summary := strings.TrimSpace(result.Choices[0].Message.Content)
	if isUnavailable(summary) {
		return SummaryUnavailable, nil
	}
	return summary, nil
}

func isUnavailable(summary string) bool {
	if summary == "" || strings.EqualFold(strings.Trim(summary, " .'\""), SummaryUnavailable) {
		return true
	}
	if len(summary) >= 100 {
		return false
	}
	lower := strings.ToLower(summary)
	for _, phrase := range refusalPhrases {
		if strings.Contains(lower, phrase) {
			return true
		}
	}
	return false
}
