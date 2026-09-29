package services

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"github.com/pratts/tts-study-assistant/backend/internal/password"
	"gorm.io/gorm"
)

type UserService struct {
	db *gorm.DB
}

// UpdateProfileRequest deliberately has no password field: passwords change
// only through UpdatePassword, which verifies the current one.
type UpdateProfileRequest struct {
	Name  string `json:"name,omitempty"`
	Email string `json:"email,omitempty"`
}

type ProfileResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func NewUserService(db *gorm.DB) *UserService {
	return &UserService{db: db}
}

func toProfile(u *models.User) ProfileResponse {
	return ProfileResponse{ID: u.ID.String(), Email: u.Email, Name: u.Name}
}

func (s *UserService) find(db *gorm.DB, userID uuid.UUID) (*models.User, error) {
	var user models.User
	if err := db.First(&user, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &user, nil
}

func (s *UserService) GetProfile(ctx context.Context, userID uuid.UUID) (*ProfileResponse, error) {
	user, err := s.find(s.db.WithContext(ctx), userID)
	if err != nil {
		return nil, err
	}
	p := toProfile(user)
	return &p, nil
}

func (s *UserService) UpdateProfile(ctx context.Context, userID uuid.UUID, req *UpdateProfileRequest) (*ProfileResponse, error) {
	db := s.db.WithContext(ctx)
	user, err := s.find(db, userID)
	if err != nil {
		return nil, err
	}

	changes := map[string]any{}
	if req.Name != "" {
		user.Name = req.Name
		changes["name"] = req.Name
	}
	if req.Email != "" && req.Email != user.Email {
		user.Email = req.Email
		changes["email"] = req.Email
	}
	if len(changes) > 0 {
		if err := db.Model(user).Updates(changes).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return nil, ErrEmailTaken
			}
			return nil, err
		}
	}

	p := toProfile(user)
	return &p, nil
}

// UpdatePassword verifies the current password, stores the new one and
// revokes every refresh token so other sessions must log in again.
func (s *UserService) UpdatePassword(ctx context.Context, userID uuid.UUID, oldPassword, newPassword string) error {
	db := s.db.WithContext(ctx)
	user, err := s.find(db, userID)
	if err != nil {
		return err
	}
	if !password.Verify(user.Password, oldPassword) {
		return ErrIncorrectPassword
	}
	hash, err := password.Hash(newPassword)
	if err != nil {
		return err
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(user).Update("password", hash).Error; err != nil {
			return err
		}
		return tx.Where("user_id = ?", user.ID).Delete(&models.RefreshToken{}).Error
	})
}
