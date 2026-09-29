package services

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/pratts/tts-study-assistant/backend/internal/password"
	"github.com/pratts/tts-study-assistant/backend/internal/tokens"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AuthService struct {
	db        *gorm.DB
	jwtSecret string
}

// RegisterRequest carries a SHA-256 hex digest of the password, not the
// raw password.
type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Source   string `json:"source"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type AuthResponse struct {
	AccessToken  string          `json:"access_token"`
	RefreshToken string          `json:"refresh_token"`
	User         ProfileResponse `json:"user"`
}

func NewAuthService(db *gorm.DB, jwtSecret string) *AuthService {
	return &AuthService{db: db, jwtSecret: jwtSecret}
}

func (s *AuthService) Register(ctx context.Context, req *RegisterRequest) (*AuthResponse, error) {
	db := s.db.WithContext(ctx)

	var exists bool
	if err := db.Model(&models.User{}).Select("count(*) > 0").Where("email = ?", req.Email).Find(&exists).Error; err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrUserExists
	}

	hash, err := password.Hash(req.Password)
	if err != nil {
		return nil, err
	}
	user := models.User{Email: req.Email, Password: hash, Name: req.Name}
	if err := db.Create(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) { // lost a concurrent registration race
			return nil, ErrUserExists
		}
		return nil, err
	}

	return s.issueSession(db, &user, tokens.SourceWeb, "")
}

func (s *AuthService) Login(ctx context.Context, req *LoginRequest) (*AuthResponse, error) {
	db := s.db.WithContext(ctx)

	var user models.User
	if err := db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			password.SimulateVerify(req.Password)
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	ok, needsRehash := password.Verify(user.Password, req.Password)
	if !ok {
		return nil, ErrInvalidCredentials
	}
	if needsRehash {
		s.upgradePasswordHash(db, &user, req.Password)
	}

	return s.issueSession(db, &user, tokens.NormalizeSource(req.Source), "")
}

// upgradePasswordHash replaces a legacy password value with a bcrypt hash.
// A failure is logged but does not block the login; it is retried next time.
func (s *AuthService) upgradePasswordHash(db *gorm.DB, user *models.User, secret string) {
	hash, err := password.Hash(secret)
	if err == nil {
		err = db.Model(user).Update("password", hash).Error
	}
	if err != nil {
		slog.Error("password hash upgrade failed", "user_id", user.ID, "err", err)
	}
}

// Refresh rotates a refresh token. The old token is consumed by a single
// DELETE ... RETURNING, so concurrent requests with the same token cannot
// both succeed.
func (s *AuthService) Refresh(ctx context.Context, rawToken string) (*AuthResponse, error) {
	var resp *AuthResponse
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var old models.RefreshToken
		res := tx.Clauses(clause.Returning{}).
			Where("token = ? AND expires_at > ?", tokens.HashRefresh(rawToken), time.Now()).
			Delete(&old)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrInvalidRefreshToken
		}

		var user models.User
		if err := tx.First(&user, "id = ?", old.UserID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrInvalidRefreshToken
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
func (s *AuthService) Logout(ctx context.Context, rawToken string) error {
	return s.db.WithContext(ctx).
		Where("token = ?", tokens.HashRefresh(rawToken)).
		Delete(&models.RefreshToken{}).Error
}

// CleanupExpiredRefreshTokens deletes all expired refresh tokens.
func (s *AuthService) CleanupExpiredRefreshTokens(ctx context.Context) error {
	return s.db.WithContext(ctx).Where("expires_at < ?", time.Now()).Delete(&models.RefreshToken{}).Error
}

// issueSession creates an access token and a stored refresh token.
func (s *AuthService) issueSession(db *gorm.DB, user *models.User, source, deviceInfo string) (*AuthResponse, error) {
	accessToken, err := tokens.IssueAccess(s.jwtSecret, user.ID.String(), user.Email, source)
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

	return &AuthResponse{AccessToken: accessToken, RefreshToken: raw, User: toProfile(user)}, nil
}
