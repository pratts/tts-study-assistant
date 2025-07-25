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
	// Call OpenAI API
	payload := map[string]interface{}{
		"model": "gpt-3.5-turbo",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You are a helpful assistant that creates concise summaries. Summarize the following text in 2-3 sentences, capturing the key points.",
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

	return result.Choices[0].Message.Content, nil
}
