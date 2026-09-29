package services

import (
	"errors"

	"github.com/pratts/tts-study-assistant/backend/internal/database"
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

type UserProfileResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func NewUserService() *UserService {
	return &UserService{
		db: database.DB,
	}
}

func (s *UserService) GetProfile(userID string) (*UserProfileResponse, error) {
	var user models.User
	if err := s.db.Where("id = ?", userID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}

	response := &UserProfileResponse{
		ID:    user.ID.String(),
		Email: user.Email,
		Name:  user.Name,
	}

	return response, nil
}

func (s *UserService) UpdateProfile(userID string, req *UpdateProfileRequest) (*UserProfileResponse, error) {
	var user models.User
	if err := s.db.Where("id = ?", userID).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("user not found")
		}
		return nil, err
	}

	// Update fields if provided
	if req.Name != "" {
		user.Name = req.Name
	}

	if req.Email != "" {
		// Check if email is already taken by another user
		var existingUser models.User
		if err := s.db.Where("email = ? AND id != ?", req.Email, userID).First(&existingUser).Error; err == nil {
			return nil, errors.New("email already taken")
		}
		user.Email = req.Email
	}

	if err := s.db.Save(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, errors.New("email already taken")
		}
		return nil, err
	}

	response := &UserProfileResponse{
		ID:    user.ID.String(),
		Email: user.Email,
		Name:  user.Name,
	}

	return response, nil
}

// UpdatePassword verifies the current password, stores the new one and
// revokes every refresh token so other sessions must log in again.
func (s *UserService) UpdatePassword(userID, oldPassword, newPassword string) error {
	var user models.User
	if err := s.db.Where("id = ?", userID).First(&user).Error; err != nil {
		return err
	}
	if ok, _ := password.Verify(user.Password, oldPassword); !ok {
		return errors.New("incorrect password")
	}
	hash, err := password.Hash(newPassword)
	if err != nil {
		return err
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&user).Update("password", hash).Error; err != nil {
			return err
		}
		return tx.Where("user_id = ?", user.ID).Delete(&models.RefreshToken{}).Error
	})
}
