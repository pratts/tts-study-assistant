package services

import (
	"errors"

	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"gorm.io/gorm"
)

type UserService struct {
	db *gorm.DB
}

type UpdateProfileRequest struct {
	Name     string `json:"name,omitempty"`
	Email    string `json:"email,omitempty"`
	Password string `json:"password,omitempty"` // Pre-hashed password from UI
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

	if req.Password != "" {
		// Store the pre-hashed password directly
		user.Password = req.Password
	}

	if err := s.db.Save(&user).Error; err != nil {
		return nil, err
	}

	response := &UserProfileResponse{
		ID:    user.ID.String(),
		Email: user.Email,
		Name:  user.Name,
	}

	return response, nil
}

func (s *UserService) UpdatePassword(userID, oldPassword, newPassword string) error {
	var user models.User
	if err := s.db.Where("id = ?", userID).First(&user).Error; err != nil {
		return err
	}
	if user.Password != oldPassword {
		return errors.New("incorrect password")
	}
	user.Password = newPassword
	return s.db.Save(&user).Error
}
