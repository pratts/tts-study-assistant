# Backend — TTS Study Assistant

Go/Fiber REST API for authentication, notes, AI summaries and user management. It serves the web app (`frontend/`) and the browser extension (`extension/`).

## Requirements

- Go 1.24+
- PostgreSQL 13+ (no extensions required)

## Quick start

```sh
cd backend
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
go run ./cmd/server
curl localhost:3000/health
```

The schema is migrated automatically on startup: GORM `AutoMigrate` plus a few idempotent data fixes in `internal/database`.

## Configuration

Environment variables, also read from `.env` if present:

| Variable | Required | Default | Description |
| -------- | -------- | ------- | ----------- |
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `JWT_SECRET` | yes | — | HS256 signing key, **at least 32 characters** (`openssl rand -hex 32`) |
| `PORT` | no | `3000` | Listen port |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated allowed origins |
| `PROXY_HEADER` | no | — | Client-IP header behind a reverse proxy, e.g. `X-Forwarded-For`. Leave unset when exposed directly, otherwise clients can spoof their IP and bypass rate limits. |
| `OPENAI_API_KEY` | no | — | Enables summaries; without it `/summarize` returns `503` |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | Chat model used for summaries |
| `OPENAI_BASE_URL` | no | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `DB_MAX_OPEN_CONNS` | no | `25` | Connection pool size |
| `DB_MAX_IDLE_CONNS` | no | `10` | Idle connections kept open |
| `DB_CONN_MAX_LIFETIME` | no | `30m` | Recycle connections after this long |

The server refuses to start when a required value is missing or invalid.

## Docker

```sh
docker build -t tts-backend backend
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgres://... -e JWT_SECRET=$(openssl rand -hex 32) \
  tts-backend
```

The image is `distroless/static` running as a non-root user. `.dockerignore` keeps `.env` out of the build context.

## Testing

```sh
go test ./...                                   # unit tests; DB tests are skipped

createdb tts_test                               # full suite
TEST_DATABASE_URL="postgres://localhost:5432/tts_test?sslmode=disable" go test -race ./...
```

- DB-backed tests (services, migrations, the end-to-end API flow in `cmd/server/e2e_test.go`) each run in their own schema, which is dropped afterwards, so they are safe to run in parallel against a shared database.
- The OpenAI API is faked with `httptest`; no key is needed.

## API

The full reference is in [`openapi.json`](./openapi.json) (OpenAPI 3.0). All routes are under `/api/v1` except `GET /health`.

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| POST | `/auth/register` | — | rate limited |
| POST | `/auth/login` | — | rate limited; `source`: `web` or `extension` |
| POST | `/auth/refresh` | — | single-use refresh token rotation |
| POST | `/auth/logout` | — | revokes the refresh token |
| GET | `/auth/verify` | Bearer | bare `{id,email,name}` (extension contract) |
| GET | `/notes` | Bearer | `page`, `page_size` (≤100), `domain`, `source_url` |
| POST | `/notes` | Bearer | |
| GET | `/notes/stats` | Bearer | note count per domain |
| GET / PUT / DELETE | `/notes/{id}` | Bearer | `PUT` is a partial update |
| POST | `/notes/{id}/summarize` | Bearer | rate limited |
| GET / PUT | `/user/profile` | Bearer | name and email only |
| PUT | `/user/password` | Bearer | revokes all sessions |

Responses use `{success, message, data}` on success and `{error, message, code}` on failure. **Every 401 carries `code: "TOKEN_EXPIRED"`**; the web app and extension use it to trigger a refresh or a logout, so keep it stable.

### Notes

- `PUT /notes/{id}` is a partial update: omitted fields are unchanged, `""` clears `source_url`/`source_title`/`domain`, and `"metadata": null` clears metadata. `content` cannot be empty, and changing it clears the stale summary.
- `metadata` must be a JSON object and is returned as stored.
- When `domain` is omitted, it is derived from `source_url` using the public suffix list (`news.bbc.co.uk` → `bbc.co.uk`).
- Notes are strictly scoped to their owner; another user's note ID returns `404`.

### Summaries

`POST /notes/{id}/summarize` asks the OpenAI chat completions API for a 2-3 sentence summary and stores it.

- The response is `{"summary": "..."}`. The value `"unavailable"` means the text was too short or incomplete; both clients check for it.
- The upstream call has a 30s timeout and is cancelled if the client disconnects.
- Only the `summary` column is written, and only if the content is unchanged since the request started. An edit made meanwhile wins, and the call returns `409`.
- Errors: `404` not found, `409` changed meanwhile, `429` rate limited, `502` OpenAI failed, `503` not configured.

## Security

### Passwords

- Clients send a SHA-256 hex digest of the password, never the raw password. The server stores that digest with **bcrypt**, so a leaked row cannot be replayed as a credential.
- Legacy rows (pre-bcrypt) are compared in constant time and upgraded to bcrypt on the user's next successful login.
- Logins for unknown emails take as long as real ones, so timing does not reveal which emails exist.
- Passwords change only through `PUT /user/password`, which verifies the current password and revokes every refresh token.

### Sessions and tokens

| `source` on login | Access token | Refresh token |
| ----------------- | ------------ | ------------- |
| `web` (default; also any unknown value) | 15 min | 30 days |
| `extension` | 1 hour | 90 days |

- Access tokens are HS256 JWTs; only HS256 with the expected issuer is accepted.
- Refresh tokens are 256-bit random values; only their SHA-256 hash is stored.
- Refresh is single-use: the old token is consumed atomically, and a replayed or concurrently reused token is rejected.
- Expired refresh tokens are purged hourly.

### Limits and hardening

| What | Limit |
| ---- | ----- |
| `POST /auth/login`, `POST /auth/register` | 10 / minute / IP → `429` |
| `POST /notes/{id}/summarize` | 10 / minute / user → `429` |
| Request body | 512 KB → `413` |
| Note `content` | 100,000 characters |
| `source_url` / `source_title` / `domain` / `name` | 2048 bytes / 512 chars / 253 bytes / 100 chars |
| Server timeouts | read 10s, write 45s, idle 60s |

- Rate-limit counters live in memory per instance. Use a shared store (e.g. Redis) if you run more than one replica.
- Non-UUID IDs return `400`. Emails are trimmed, lower-cased and validated.
- Security headers via `helmet`; CORS limited to `CORS_ORIGINS`.

## Database

| Index | Serves |
| ----- | ------ |
| `notes (user_id, created_at DESC)` | the default list, with no sort step |
| `notes (user_id, domain)` | `?domain=` and `/notes/stats` |
| `notes (user_id, source_url)` | the extension's `?source_url=` lookup |
| `refresh_tokens (token)` unique | refresh and logout |
| `refresh_tokens (user_id)`, `(expires_at)` | revoke-all and cleanup |

- Deleting a user cascades to their notes and refresh tokens.
- GORM runs with `SkipDefaultTransaction` (multi-step writes use explicit transactions) and `PrepareStmt`. If you put PgBouncer in transaction-pooling mode in front of Postgres, disable `PrepareStmt` in `database.GormConfig`.
- `GET /notes` uses offset pagination; switch to keyset pagination (`created_at`, `id`) if users reach thousands of notes.

## Project layout

```
cmd/server/          entrypoint: config, DI wiring, routes, graceful shutdown
internal/config/     environment configuration and validation
internal/database/   connection, pool and migrations
internal/models/     GORM models
internal/services/   business logic; returns sentinel errors (services/errors.go)
internal/handlers/   HTTP handlers: input validation and error → status mapping
internal/middleware/ JWT auth; exposes the caller's typed user ID
internal/tokens/     access/refresh token issuing and parsing
internal/password/   bcrypt hashing with legacy upgrade
internal/respond/    JSON response envelopes
internal/testutil/   Postgres test harness (schema per test)
```

- Dependencies are passed in through constructors from `cmd/server`; there is no global DB handle.
- Logs are structured JSON (`log/slog`) on stdout; access logs come from Fiber's logger.
- On `SIGINT`/`SIGTERM` the server stops accepting connections and waits up to 10s for in-flight requests.

## Upgrading an existing deployment

Upgrading from before these changes is automatic on first start, but note:

- `JWT_SECRET` must be at least 32 characters.
- Plaintext refresh tokens are deleted, and old access tokens (no issuer claim) are rejected, so **every user logs in once more**.
- Existing passwords are upgraded to bcrypt as users log in.
- Foreign keys are switched to `ON DELETE CASCADE`, and new indexes are created.
