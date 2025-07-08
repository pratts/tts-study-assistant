# Backend — TTS Study Assistant

Go/Fiber REST API for authentication, notes, and user management.

## Requirements

- Go 1.20+
- PostgreSQL

## Setup

1. **Install dependencies:**

   ```sh
   cd backend
   go mod tidy
   ```

2. **Configure environment variables:**

   - Copy `.env.example` to `.env` and fill in values:
     - `DATABASE_URL` — PostgreSQL connection string
     - `JWT_SECRET` — Secret for signing JWTs
     - `PORT` — (optional) API port (default: 3000)

3. **Run database migrations:**
   (Describe migration tool or manual steps if any)

4. **Start the server:**
   ```sh
   go run cmd/server/main.go
   ```

## API Documentation

- OpenAPI spec: [`openapi.json`](./openapi.json)
- All endpoints require JWT Bearer token (except /auth/\*)

## Notes

- Passwords must be pre-hashed (SHA-256) by the client.
- See `/internal/models/` for data models.
