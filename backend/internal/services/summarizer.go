// internal/services/summarizer.go
package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
)

type SummarizerService struct {
	apiKey string
}

func NewSummarizerService() *SummarizerService {
	return &SummarizerService{
		apiKey: os.Getenv("OPENAI_API_KEY"),
	}
}

func (s *SummarizerService) Summarize(text string) (string, error) {
	// Check if text is too short for meaningful summarization
	if len(text) < 20 {
		return "unavailable", nil
	}

	// Call OpenAI API
	payload := map[string]interface{}{
		"model": "gpt-3.5-turbo",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You are a helpful assistant that creates concise summaries. Summarize the following text in 2-3 sentences, capturing the key points. If the text is too short, incomplete, or lacks sufficient content for meaningful summarization, respond with exactly 'unavailable' (no quotes, no additional text).",
			},
			{
				"role":    "user",
				"content": text,
			},
		},
		"temperature": 0.7,
		"max_tokens":  150,
	}
	fmt.Println("Payload for gpt: ", payload)

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(jsonPayload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", errors.New("OpenAI API error: " + string(bodyBytes))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return "", err
	}

	fmt.Println("Result: ", result)
	if len(result.Choices) == 0 {
		return "", errors.New("no summary returned from OpenAI API")
	}

	summary := result.Choices[0].Message.Content

	// Check if the response indicates unavailability
	if summary == "unavailable" {
		return "unavailable", nil
	}

	// Check for common phrases that indicate the text is too short or incomplete
	unavailablePhrases := []string{
		"text appears to be cut-off",
		"please provide more context",
		"complete text",
		"insufficient content",
		"too short",
		"incomplete",
		"cannot create",
		"need more information",
	}

	for _, phrase := range unavailablePhrases {
		if len(summary) > 0 && len(summary) < 100 &&
			(len(summary) < 50 || containsIgnoreCase(summary, phrase)) {
			return "unavailable", nil
		}
	}

	return summary, nil
}

// Helper function to check if a string contains a substring (case insensitive)
func containsIgnoreCase(s, substr string) bool {
	return len(s) >= len(substr) &&
		(len(s) == len(substr) && s == substr ||
			len(s) > len(substr) && (s[:len(substr)] == substr ||
				s[len(s)-len(substr):] == substr ||
				containsSubstring(s, substr)))
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
