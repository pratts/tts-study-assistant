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
     - `CORS_ORIGINS` — comma-separated allowed origins (default: `http://localhost:3000`)
     - `PROXY_HEADER` — (optional) client-IP header when behind a reverse proxy, e.g. `X-Forwarded-For`. Leave unset when the API is exposed directly, otherwise clients can spoof their IP and bypass rate limits.
     - `DB_MAX_OPEN_CONNS` / `DB_MAX_IDLE_CONNS` — (optional) connection pool size (default: 25 / 10)
     - `DB_CONN_MAX_LIFETIME` — (optional) recycle connections after this long (default: `30m`)
     - `OPENAI_API_KEY` — (optional) enables `POST /notes/{id}/summarize`; without it the endpoint returns 503
     - `OPENAI_MODEL` — (optional) chat model for summaries (default: `gpt-4o-mini`)
     - `OPENAI_BASE_URL` — (optional) OpenAI-compatible API base URL (default: `https://api.openai.com/v1`)

3. **Database schema:**
   Migrations run automatically on startup (GORM `AutoMigrate` plus a few idempotent data fixes in `internal/database`). No Postgres extensions are required.

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

## Limits

| What | Limit |
| ---- | ----- |
| `POST /auth/login`, `POST /auth/register` | 10 requests / minute / IP → `429` |
| `POST /notes/{id}/summarize` | 10 requests / minute / user → `429` |
| Request body | 512 KB → `413` |
| Note `content` | 100,000 characters |
| `source_url` / `source_title` / `domain` | 2048 bytes / 512 characters / 253 bytes |
| `page_size` on `GET /notes` | clamped to 1..100 |
| Server timeouts | read 10s, write 45s, idle 60s |

- Rate-limit counters are kept in memory per instance.
- Note IDs that are not UUIDs return `400`.
- Emails are trimmed and lower-cased on register, login and profile update. Existing mixed-case emails are normalized on startup unless that would collide with another account.
- Responses carry security headers (`helmet`): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, etc.

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

## Notes API semantics

- `PUT /api/v1/notes/{id}` is a partial update: omitted fields are unchanged, `""` clears `source_url`/`source_title`/`domain`, and `"metadata": null` clears metadata. `content` cannot be empty.
- `metadata` must be a JSON object and is returned exactly as stored.
- When `domain` is omitted on create, it is derived from `source_url` using the public suffix list (`news.bbc.co.uk` → `bbc.co.uk`).

## Database

| Index | Serves |
| ----- | ------ |
| `notes (user_id, created_at DESC)` | the default notes list (no sort step) |
| `notes (user_id, domain)` | `?domain=` filter and `/notes/stats` |
| `notes (user_id, source_url)` | the extension's `?source_url=` lookup |
| `refresh_tokens (token)` unique | refresh and logout lookups |
| `refresh_tokens (user_id)` / `(expires_at)` | revoke-all on password change and hourly cleanup |

- Deleting a user cascades to their notes and refresh tokens.
- GORM runs with `SkipDefaultTransaction` (multi-step writes use explicit transactions) and `PrepareStmt`. If you put PgBouncer in transaction-pooling mode in front of Postgres, disable `PrepareStmt` in `database.GormConfig`.
- `GET /notes` uses offset pagination. That is fine at current note counts; switch to keyset (`created_at`, `id`) pagination if users reach thousands of notes.

## Project layout

```
cmd/server/          entrypoint: config, DI wiring, routes, graceful shutdown
internal/config/     environment configuration and validation
internal/database/   connection and migrations
internal/models/     GORM models
internal/services/   business logic; returns sentinel errors (services/errors.go)
internal/handlers/   HTTP handlers: validation and error → status mapping
internal/middleware/ JWT auth; exposes the caller's typed user ID
internal/tokens/     access/refresh token issuing and parsing
internal/password/   bcrypt hashing with legacy upgrade
internal/respond/    JSON response envelopes
internal/testutil/   Postgres test harness
```

- Dependencies are passed in through constructors from `cmd/server`; there is no global DB handle.
- Logs are structured JSON (`log/slog`) on stdout; access logs come from Fiber's logger.
- On `SIGINT`/`SIGTERM` the server stops accepting connections and waits up to 10s for in-flight requests.
