package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/pratts/tts-study-assistant/backend/internal/config"
	"github.com/pratts/tts-study-assistant/backend/internal/database"
	"github.com/pratts/tts-study-assistant/backend/internal/handlers"
	"github.com/pratts/tts-study-assistant/backend/internal/middleware"
	"github.com/pratts/tts-study-assistant/backend/internal/respond"
	"github.com/pratts/tts-study-assistant/backend/internal/services"
	"gorm.io/gorm"
)

const (
	// bodyLimit fits the largest accepted note (handlers.MaxContentRunes of
	// 4-byte runes) plus JSON overhead.
	bodyLimit = 512 * 1024

	authRateLimit      = 10 // requests per minute per IP on login/register
	summarizeRateLimit = 10 // requests per minute per user

	shutdownTimeout = 10 * time.Second
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("invalid configuration: %w", err)
	}
	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	app := newApp(cfg, db)
	go cleanupRefreshTokens(ctx, services.NewAuthService(db, cfg.JWTSecret), time.Hour)

	errc := make(chan error, 1)
	go func() {
		slog.Info("server starting", "port", cfg.Port)
		errc <- app.Listen(":" + cfg.Port)
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		slog.Info("shutting down")
		return app.ShutdownWithTimeout(shutdownTimeout)
	}
}

// newApp builds the HTTP server with middleware and routes.
func newApp(cfg *config.Config, db *gorm.DB) *fiber.App {
	app := fiber.New(fiber.Config{
		ErrorHandler: customErrorHandler,
		BodyLimit:    bodyLimit,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 45 * time.Second, // summarize waits up to 30s on OpenAI
		IdleTimeout:  60 * time.Second,
		ProxyHeader:  cfg.ProxyHeader,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(helmet.New(helmet.Config{
		// The API is called cross-origin by the web app and the extension.
		CrossOriginResourcePolicy: "cross-origin",
	}))
	app.Use(cors.New(cors.Config{
		AllowOrigins: strings.Join(cfg.CORSOrigins, ","),
		AllowMethods: "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders: "Origin,Content-Type,Accept,Authorization",
	}))

	setupRoutes(app, cfg, db)
	return app
}

func setupRoutes(app *fiber.App, cfg *config.Config, db *gorm.DB) {
	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"message": "TTS Study Assistant API",
		})
	})

	summarizer := services.NewSummarizerService(cfg.OpenAIAPIKey, cfg.OpenAIModel, cfg.OpenAIBaseURL)
	users := services.NewUserService(db)
	authHandler := handlers.NewAuthHandler(services.NewAuthService(db, cfg.JWTSecret), users)
	notesHandler := handlers.NewNotesHandler(services.NewNotesService(db, summarizer))
	userHandler := handlers.NewUserHandler(users)
	requireAuth := middleware.Auth(cfg.JWTSecret)

	authLimit := rateLimit(authRateLimit, func(c *fiber.Ctx) string { return c.IP() })
	summarizeLimit := rateLimit(summarizeRateLimit, func(c *fiber.Ctx) string {
		return middleware.UserID(c).String()
	})

	// API routes
	api := app.Group("/api/v1")

	// Auth routes (public)
	auth := api.Group("/auth")
	auth.Post("/register", authLimit, authHandler.Register)
	auth.Post("/login", authLimit, authHandler.Login)
	auth.Post("/refresh", authHandler.Refresh)
	auth.Post("/logout", authHandler.Logout)
	auth.Get("/verify", requireAuth, authHandler.Verify)

	// Protected routes
	protected := api.Group("", requireAuth)

	// Notes routes (protected)
	notes := protected.Group("/notes")
	notes.Get("/", notesHandler.GetNotes)
	notes.Post("/", notesHandler.CreateNote)
	notes.Get("/stats", notesHandler.GetNotesStats)
	notes.Get("/:id", notesHandler.GetNote)
	notes.Put("/:id", notesHandler.UpdateNote)
	notes.Delete("/:id", notesHandler.DeleteNote)
	notes.Post("/:id/summarize", summarizeLimit, notesHandler.SummarizeNote)

	// User routes (protected)
	user := protected.Group("/user")
	user.Get("/profile", userHandler.GetProfile)
	user.Put("/profile", userHandler.UpdateProfile)
	user.Put("/password", userHandler.UpdatePassword)
}

// rateLimit allows max requests per minute per key.
func rateLimit(max int, key func(*fiber.Ctx) string) fiber.Handler {
	return limiter.New(limiter.Config{
		Max:          max,
		Expiration:   time.Minute,
		KeyGenerator: key,
		LimitReached: func(c *fiber.Ctx) error {
			return respond.Error(c, fiber.StatusTooManyRequests, "Too many requests, please try again later")
		},
	})
}

// cleanupRefreshTokens deletes expired refresh tokens every interval until
// ctx is cancelled.
func cleanupRefreshTokens(ctx context.Context, auth *services.AuthService, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := auth.CleanupExpiredRefreshTokens(ctx); err != nil {
				slog.Error("refresh token cleanup failed", "err", err)
			}
		}
	}
}

// customErrorHandler renders errors returned by fiber itself (404, 405,
// 413, panics recovered by middleware) in the API's error envelope.
func customErrorHandler(c *fiber.Ctx, err error) error {
	var fe *fiber.Error
	if errors.As(err, &fe) {
		return respond.Error(c, fe.Code, fe.Message)
	}
	slog.Error("unhandled error", "method", c.Method(), "path", c.Path(), "err", err)
	return respond.Error(c, fiber.StatusInternalServerError, "Internal Server Error")
}
