package services

import (
	"errors"
	"log"
	"time"

	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/pratts/tts-study-assistant/backend/internal/password"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AuthService struct {
	db  *gorm.DB
	cfg *config.Config
}

type RegisterRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"` // Pre-hashed password from UI
	Name     string `json:"name" validate:"required"`
}

type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"` // Pre-hashed password from UI
	Source   string `json:"source"`
}

type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	} `json:"user"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{
		db:  database.DB,
		cfg: cfg,
	}
}

func (s *AuthService) Register(req *RegisterRequest) (*AuthResponse, error) {
	// Check if user already exists
	var existingUser models.User
	if err := s.db.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		return nil, errors.New("user already exists")
	}

	hash, err := password.Hash(req.Password)
	if err != nil {
		return nil, err
	}
	user := models.User{
		Email:    req.Email,
		Password: hash,
		Name:     req.Name,
	}

	if err := s.db.Create(&user).Error; err != nil {
		return nil, err
	}

	return s.issueSession(s.db, &user, tokens.SourceWeb, "")
}

func (s *AuthService) Login(req *LoginRequest) (*AuthResponse, error) {
	// Find user
	var user models.User
	if err := s.db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			password.SimulateVerify(req.Password)
			return nil, errors.New("invalid credentials")
		}
		return nil, err
	}

	ok, needsRehash := password.Verify(user.Password, req.Password)
	if !ok {
		return nil, errors.New("invalid credentials")
	}
	if needsRehash {
		s.upgradePasswordHash(&user, req.Password)
	}

	return s.issueSession(s.db, &user, tokens.NormalizeSource(req.Source), "")
}

// upgradePasswordHash replaces a legacy password value with a bcrypt hash.
// A failure is logged but does not block the login; it is retried next time.
func (s *AuthService) upgradePasswordHash(user *models.User, secret string) {
	hash, err := password.Hash(secret)
	if err == nil {
		err = s.db.Model(user).Update("password", hash).Error
	}
	if err != nil {
		log.Printf("password hash upgrade failed for user %s: %v", user.ID, err)
	}
}

// Refresh rotates a refresh token. The old token is consumed by a single
// DELETE ... RETURNING, so concurrent requests with the same token cannot
// both succeed.
func (s *AuthService) Refresh(req *RefreshRequest) (*AuthResponse, error) {
	var resp *AuthResponse
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var old models.RefreshToken
		res := tx.Clauses(clause.Returning{}).
			Where("token = ? AND expires_at > ?", tokens.HashRefresh(req.RefreshToken), time.Now()).
			Delete(&old)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errors.New("invalid refresh token")
		}

		var user models.User
		if err := tx.First(&user, "id = ?", old.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errors.New("invalid refresh token")
			}
			return err
		}

		var err error
		resp, err = s.issueSession(tx, &user, old.Source, old.DeviceInfo)
		return err
	})
	return resp, err
}

// Logout revokes a refresh token. Unknown tokens are not an error.
func (s *AuthService) Logout(refreshToken string) error {
	return s.db.Where("token = ?", tokens.HashRefresh(refreshToken)).Delete(&models.RefreshToken{}).Error
}

// issueSession creates an access token and a stored refresh token.
func (s *AuthService) issueSession(db *gorm.DB, user *models.User, source, deviceInfo string) (*AuthResponse, error) {
	accessToken, err := tokens.IssueAccess(s.cfg.JWTSecret, user.ID.String(), user.Email, source)
	if err != nil {
		return nil, err
	}

	raw, hash, err := tokens.NewRefresh()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	rt := models.RefreshToken{
		TokenHash:  hash,
		UserID:     user.ID,
		ExpiresAt:  now.Add(tokens.RefreshTTL(source)),
		Source:     source,
		LastUsedAt: &now,
		DeviceInfo: deviceInfo,
	}
	if err := db.Create(&rt).Error; err != nil {
		return nil, err
	}

	resp := &AuthResponse{AccessToken: accessToken, RefreshToken: raw}
	resp.User.ID = user.ID.String()
	resp.User.Email = user.Email
	resp.User.Name = user.Name
	return resp, nil
}

// GetUserByID fetches a user by ID
func (s *AuthService) GetUserByID(userID string) (*models.User, error) {
	var user models.User
	if err := s.db.Where("id = ?", userID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// CleanupExpiredRefreshTokens deletes all expired refresh tokens from the database
func (s *AuthService) CleanupExpiredRefreshTokens() error {
	return s.db.Where("expires_at < ?", time.Now()).Delete(&models.RefreshToken{}).Error
}
