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

## Testing

```sh
go test ./...
```

Service tests need a Postgres database; they are skipped when `TEST_DATABASE_URL` is unset. Each test runs in its own schema, which is dropped afterwards.

```sh
createdb tts_test
psql -d tts_test -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
TEST_DATABASE_URL="postgres://localhost:5432/tts_test?sslmode=disable" go test ./...
```

## Password handling

- Clients (web app and extension) send a SHA-256 hex digest of the password, never the raw password.
- The server hashes that digest with **bcrypt** before storing it. The stored value cannot be replayed as a credential.
- Rows created before bcrypt was introduced are upgraded transparently on the user's next successful login.
- Passwords change only through `PUT /api/v1/user/password`, which verifies the current password and revokes every refresh token (all other sessions are logged out). `PUT /api/v1/user/profile` does not accept a password.

## Notes

- See `/internal/models/` for data models.
