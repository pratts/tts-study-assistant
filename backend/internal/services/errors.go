package services

import "errors"

// Errors returned by the services. Handlers map them to HTTP statuses with
// errors.Is; anything else is an internal error.
var (
	ErrNotFound            = errors.New("not found")
	ErrUserExists          = errors.New("user already exists")
	ErrEmailTaken          = errors.New("email already taken")
	ErrInvalidCredentials  = errors.New("invalid credentials")
	ErrIncorrectPassword   = errors.New("incorrect password")
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
	ErrNoteChanged         = errors.New("note changed during summarization")
	ErrSummarizerDisabled  = errors.New("summarizer is not configured")
	ErrSummarizerUpstream  = errors.New("summarizer upstream failed")
)
