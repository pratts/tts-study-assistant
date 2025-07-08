# ---- Build Stage ----
FROM golang:1.24 as builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
RUN go mod download

# Copy the source code
COPY . .

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server/main.go

# ---- Run Stage ----
FROM gcr.io/distroless/base-debian12

WORKDIR /app

# Copy the built binary from builder
COPY --from=builder /app/server ./server

# Copy any migrations or static files if needed (uncomment if you have them)
# COPY --from=builder /app/migrations ./migrations
# COPY --from=builder /app/static ./static

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables (override in deployment)
# ENV DATABASE_URL=postgres://user:pass@host:port/dbname
# ENV JWT_SECRET=your-secret
# ENV JWT_REFRESH_SECRET=your-refresh-secret
# ENV PORT=3000

# Run the server binary
ENTRYPOINT ["/app/server"] 