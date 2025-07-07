package services

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/models"
	"gorm.io/gorm"
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

// Claims struct for JWT parsing
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
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

	// Create user with pre-hashed password
	user := models.User{
		Email:    req.Email,
		Password: req.Password, // Store the pre-hashed password directly
		Name:     req.Name,
	}

	if err := s.db.Create(&user).Error; err != nil {
		return nil, err
	}

	// Generate tokens
	accessToken, err := s.generateAccessToken(user.ID.String(), user.Email)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.generateRefreshToken(user.ID.String())
	if err != nil {
		return nil, err
	}

	response := &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}
	response.User.ID = user.ID.String()
	response.User.Email = user.Email
	response.User.Name = user.Name

	return response, nil
}

func (s *AuthService) Login(req *LoginRequest) (*AuthResponse, error) {
	// Find user
	var user models.User
	if err := s.db.Where("email = ?", req.Email).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid credentials")
		}
		return nil, err
	}

	// Compare pre-hashed passwords directly
	if user.Password != req.Password {
		return nil, errors.New("invalid credentials")
	}

	source := req.Source
	if source == "" {
		source = "web"
	}

	// Generate tokens
	accessToken, err := s.generateAccessTokenWithSource(user.ID.String(), user.Email, source)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.generateRefreshTokenWithSource(user.ID.String(), source, "")
	if err != nil {
		return nil, err
	}

	response := &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}
	response.User.ID = user.ID.String()
	response.User.Email = user.Email
	response.User.Name = user.Name

	return response, nil
}

func (s *AuthService) Refresh(req *RefreshRequest) (*AuthResponse, error) {
	// Find refresh token
	var refreshToken models.RefreshToken
	if err := s.db.Where("token = ?", req.RefreshToken).First(&refreshToken).Error; err != nil {
		return nil, errors.New("invalid refresh token")
	}
	if refreshToken.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("invalid refresh token")
	}

	// Get user
	var user models.User
	if err := s.db.First(&user, refreshToken.UserID).Error; err != nil {
		return nil, err
	}

	// Update LastUsedAt
	now := time.Now()
	s.db.Model(&refreshToken).Update("last_used_at", &now)

	// Token rotation: delete old, create new with same source/device
	s.db.Delete(&refreshToken)

	accessToken, err := s.generateAccessTokenWithSource(user.ID.String(), user.Email, refreshToken.Source)
	if err != nil {
		return nil, err
	}
	newRefreshToken, err := s.generateRefreshTokenWithSource(user.ID.String(), refreshToken.Source, refreshToken.DeviceInfo)
	if err != nil {
		return nil, err
	}

	response := &AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
	}
	response.User.ID = user.ID.String()
	response.User.Email = user.Email
	response.User.Name = user.Name

	return response, nil
}

func (s *AuthService) Logout(refreshToken string) error {
	// Delete refresh token (idempotent)
	s.db.Where("token = ?", refreshToken).Delete(&models.RefreshToken{})
	return nil
}

func (s *AuthService) generateAccessToken(userID, email string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(time.Hour * 24).Unix(), // 24 hours
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *AuthService) generateRefreshToken(userID string) (string, error) {
	// Generate random refresh token
	refreshToken := uuid.New().String()

	// Store refresh token in database
	refreshTokenModel := models.RefreshToken{
		Token:     refreshToken,
		UserID:    uuid.MustParse(userID),
		ExpiresAt: time.Now().Add(time.Hour * 24 * 7), // 7 days
	}

	if err := s.db.Create(&refreshTokenModel).Error; err != nil {
		return "", err
	}

	return refreshToken, nil
}

// Helper: generate access token with source-based expiry
func (s *AuthService) generateAccessTokenWithSource(userID, email, source string) (string, error) {
	var exp time.Duration
	switch source {
	case "extension":
		exp = time.Hour * 1
	default:
		exp = time.Minute * 15
	}
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"exp":     time.Now().Add(exp).Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

// Helper: generate refresh token with source-based expiry and device info
func (s *AuthService) generateRefreshTokenWithSource(userID, source, deviceInfo string) (string, error) {
	refreshToken := uuid.New().String()
	var exp time.Duration
	switch source {
	case "extension":
		exp = time.Hour * 24 * 90 // 90 days
	default:
		exp = time.Hour * 24 * 30 // 30 days
	}
	refreshTokenModel := models.RefreshToken{
		Token:      refreshToken,
		UserID:     uuid.MustParse(userID),
		ExpiresAt:  time.Now().Add(exp),
		Source:     source,
		DeviceInfo: deviceInfo,
	}
	if err := s.db.Create(&refreshTokenModel).Error; err != nil {
		return "", err
	}
	return refreshToken, nil
}

// GenerateAccessTokenForSource is a public wrapper for generateAccessTokenWithSource
func (s *AuthService) GenerateAccessTokenForSource(userID, email, source string) (string, error) {
	return s.generateAccessTokenWithSource(userID, email, source)
}

// GenerateRefreshTokenForSource is a public wrapper for generateRefreshTokenWithSource
func (s *AuthService) GenerateRefreshTokenForSource(userID, source, deviceInfo string) (string, error) {
	return s.generateRefreshTokenWithSource(userID, source, deviceInfo)
}

// ParseToken parses a JWT and returns claims
func (s *AuthService) ParseToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, err
	}
	return claims, nil
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
