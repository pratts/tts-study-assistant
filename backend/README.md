# TTS Study Assistant Backend

A Go backend API for the TTS Study Assistant application built with Fiber framework and PostgreSQL.

## Features

- User authentication with JWT tokens
- CRUD operations for study notes
- User profile management
- Pre-hashed password support (UI handles password hashing)
- Refresh token mechanism
- CORS support for frontend and browser extension

## Setup

### Prerequisites

- Go 1.24.2 or higher
- PostgreSQL database

### Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# Database Configuration
DATABASE_URL=postgres://username:password@localhost:5432/tts_study_assistant

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here

# Server Configuration
PORT=3000

# CORS Configuration (comma-separated)
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,chrome-extension://your-extension-id
```

### Installation

1. Install dependencies:

```bash
go mod tidy
```

2. Run the server:

```bash
go run cmd/server/main.go
```

The server will start on the configured port (default: 3000).

## API Endpoints

### Authentication (Public)

- `POST /api/v1/auth/register` - Register a new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout user

### Notes (Protected - Requires JWT)

- `GET /api/v1/notes` - Get all notes for the authenticated user
- `POST /api/v1/notes` - Create a new note
- `GET /api/v1/notes/:id` - Get a specific note
- `PUT /api/v1/notes/:id` - Update a note
- `DELETE /api/v1/notes/:id` - Delete a note

### User Profile (Protected - Requires JWT)

- `GET /api/v1/user/profile` - Get user profile
- `PUT /api/v1/user/profile` - Update user profile

## Request/Response Examples

### Register User

**Request:**

```json
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "hashed-password-from-ui",
  "name": "John Doe"
}
```

**Response:**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "uuid-refresh-token",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

### Login User

**Request:**

```json
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "hashed-password-from-ui"
}
```

### Create Note

**Request:**

```json
POST /api/v1/notes
Authorization: Bearer <access_token>
{
  "content": "This is my study note",
  "source_url": "https://example.com",
  "source_title": "Example Article"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Note created successfully",
  "data": {
    "id": "note-uuid",
    "content": "This is my study note",
    "source_url": "https://example.com",
    "source_title": "Example Article",
    "created_at": "2024-01-01T12:00:00Z",
    "updated_at": "2024-01-01T12:00:00Z"
  }
}
```

## Authentication

All protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Access tokens expire after 24 hours. Use the refresh endpoint to get a new access token using the refresh token.

## Password Handling

**Important**: The API expects pre-hashed passwords from the UI. The frontend/extension should:

1. Hash the user's password using a secure hashing algorithm (e.g., bcrypt, SHA-256)
2. Send the hashed password to the API endpoints
3. The API stores and compares the hashed passwords directly

This approach ensures that plain text passwords are never transmitted over the network.

## Error Handling

The API returns consistent error responses:

```json
{
  "error": true,
  "message": "Error description",
  "code": "ERROR_CODE" // optional
}
```

Common HTTP status codes:

- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `409` - Conflict (e.g., email already exists)
- `500` - Internal Server Error
