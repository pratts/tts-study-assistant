package services

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/password"
	"github.com/pratts/tts-study-assistant/backend/internal/testutil"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func init() { password.Cost = bcrypt.MinCost }

const (
	testSecret = "test-secret-test-secret-test-secret"
	clientHash = "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b"
)

var ctx = context.Background()

// env bundles the services under test, all sharing one isolated schema.
type env struct {
	db    *gorm.DB
	auth  *AuthService
	users *UserService
	notes *NotesService
}

func newEnv(t *testing.T) *env {
	return newEnvWithSummarizer(t, NewSummarizerService("", "", ""))
}

func newEnvWithSummarizer(t *testing.T, s *SummarizerService) *env {
	db := testutil.NewDB(t)
	return &env{
		db:    db,
		auth:  NewAuthService(db, testSecret),
		users: NewUserService(db),
		notes: NewNotesService(db, s),
	}
}

func (e *env) register(t *testing.T, email string) (*AuthResponse, uuid.UUID) {
	t.Helper()
	resp, err := e.auth.Register(ctx, &RegisterRequest{Email: email, Password: clientHash, Name: "Test"})
	require.NoError(t, err)
	return resp, uuid.MustParse(resp.User.ID)
}
