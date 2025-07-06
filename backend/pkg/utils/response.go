package utils

import "github.com/gofiber/fiber/v2"

type ErrorResponse struct {
	Error   bool   `json:"error"`
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

type SuccessResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

func SendError(c *fiber.Ctx, status int, message string, code ...string) error {
	response := ErrorResponse{
		Error:   true,
		Message: message,
	}

	if len(code) > 0 {
		response.Code = code[0]
	}

	return c.Status(status).JSON(response)
}

func SendSuccess(c *fiber.Ctx, message string, data ...interface{}) error {
	response := SuccessResponse{
		Success: true,
		Message: message,
	}

	if len(data) > 0 {
		response.Data = data[0]
	}

	return c.Status(fiber.StatusOK).JSON(response)
}
