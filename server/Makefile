# Makefile for Go daemon project
.PHONY: all build up down clean lint

# Variables
BINARY_NAME = server
DAEMON_SRC = ./cmd/daemon
SERVER_SRC = ./cmd/server
PROTO_SRC = ./cmd/proto
JET_SRC = ./cmd/jetgen
PID_FILE = server.pid
LOG_FILE = server.log

# Default target
all: build

server:
	@echo "Starting server..."
	@go run $(SERVER_SRC)
start: server
s: server

proto:
	@echo "Generating protocol buffers..."
	@go run $(PROTO_SRC)

jet:
	@echo "Generating jet files..."
	@go run $(JET_SRC)

# Build the daemon binary
build:
	@echo "Building $(BINARY_NAME)..."
	@go build -o $(BINARY_NAME) $(DAEMON_SRC)

# Start the daemon
up: build
	@echo "Starting daemon..."
	@./$(BINARY_NAME) &

# Stop the daemon
down:
	@echo "Stopping daemon..."
	@if [ -f $(PID_FILE) ]; then \
		kill `cat $(PID_FILE)` && rm -f $(PID_FILE); \
		echo "Daemon stopped"; \
	else \
		echo "No PID file found, daemon may not be running"; \
	fi

# Clean up generated files
clean:
	@echo "Cleaning up..."
	@rm -f $(BINARY_NAME) $(PID_FILE) $(LOG_FILE)

# Run linter (optional, requires golangci-lint)
lint:
	@echo "Running linter..."
	@golangci-lint run ./...