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
     - `JWT_SECRET` — Secret for signing JWTs, at least 32 characters (`openssl rand -hex 32`). The server refuses to start without it.
     - `PORT` — (optional) API port (default: 3000)
     - `OPENAI_API_KEY` — (optional) enables `POST /notes/{id}/summarize`; without it the endpoint returns 503
     - `OPENAI_MODEL` — (optional) chat model for summaries (default: `gpt-4o-mini`)
     - `OPENAI_BASE_URL` — (optional) OpenAI-compatible API base URL (default: `https://api.openai.com/v1`)

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

## Summaries

`POST /api/v1/notes/{id}/summarize` sends the note to the OpenAI chat completions API and stores a 2-3 sentence summary.

- The response is `{"summary": "..."}`. The value `"unavailable"` means the text was too short or incomplete to summarize; the clients check for it.
- The upstream call has a 30s timeout and is cancelled if the client disconnects.
- Only the `summary` column is written, and only if the content is unchanged since the request started. An edit made during summarization wins, and the request returns `409`.
- Editing a note's content clears its summary, since it no longer matches.

| Status | Meaning |
| ------ | ------- |
| 404 | Note not found (or not yours) |
| 409 | Note changed during summarization; retry |
| 502 | OpenAI call failed |
| 503 | `OPENAI_API_KEY` not configured |

## Sessions and tokens

| Source (`source` on login) | Access token | Refresh token |
| -------------------------- | ------------ | ------------- |
| `web` (default; also any unknown value) | 15 min | 30 days |
| `extension` | 1 hour | 90 days |

- Access tokens are HS256 JWTs. Only HS256 with the expected issuer is accepted.
- Refresh tokens are 256-bit random values. Only their SHA-256 hash is stored.
- `POST /auth/refresh` is single-use: the old token is consumed atomically, and a replayed or concurrently reused token is rejected.
- Expired refresh tokens are purged hourly.
- `GET /auth/verify` (Bearer token) returns `{id, email, name}`; the extension uses it to check its session.
- Every 401 carries `code: "TOKEN_EXPIRED"`; the clients use that code to trigger a refresh or a logout.
- Upgrade note: refresh tokens stored in plaintext before this change are deleted on startup, so users log in once more.

## Notes

- See `/internal/models/` for data models.
