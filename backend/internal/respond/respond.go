// Package respond writes the API's JSON response envelopes.
package respond

import "github.com/gofiber/fiber/v2"

type ErrorResponse struct {
	Error   bool   `json:"error"`
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

type SuccessResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Data    any    `json:"data,omitempty"`
}

// Error writes an error envelope. code is an optional machine-readable code.
func Error(c *fiber.Ctx, status int, message string, code ...string) error {
	resp := ErrorResponse{Error: true, Message: message}
	if len(code) > 0 {
		resp.Code = code[0]
	}
	return c.Status(status).JSON(resp)
}

// OK writes a 200 success envelope with optional data.
func OK(c *fiber.Ctx, message string, data ...any) error {
	resp := SuccessResponse{Success: true, Message: message}
	if len(data) > 0 {
		resp.Data = data[0]
	}
	return c.Status(fiber.StatusOK).JSON(resp)
}
