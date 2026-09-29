# ---- Build ----
FROM golang:1.24 AS builder

WORKDIR /src

# Cache dependencies separately from the source.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---- Run ----
# Static distroless image: no shell or package manager, runs as an
# unprivileged user.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /out/server /server

EXPOSE 3000
USER nonroot:nonroot

# Configure via environment variables (see README): DATABASE_URL,
# JWT_SECRET, PORT, CORS_ORIGINS, OPENAI_API_KEY, ...
ENTRYPOINT ["/server"]
