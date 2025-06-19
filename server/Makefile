# Makefile for Go daemon project
.PHONY: all build up down clean lint server start s capnp capn jet quest

# Variables
SERVER_SRC = ./cmd/server
SERVER_NAME = server
DAEMON_SRC = ./cmd/daemon
DUMP_SRC = ./cmd/dump
IMPORT_SRC = ./cmd/import
DAEMON_NAME = daemon
CAPNP_SRC = ./cmd/capnp
JET_SRC = ./cmd/jetgen
PID_FILE = server.pid
LOG_FILE = server.log

# Default target
all: build

dump:
	@echo "Dumping DB..."
	@go run $(DUMP_SRC) dump

import:
	@echo "Importing DB..."
	@go run $(IMPORT_SRC) import

server:
	@echo "Starting server..."
	@go run $(SERVER_SRC)
start: server
s: server

capnp:
	@echo "Generating capnp go/TS..."
	@go run $(CAPNP_SRC)
capn: capnp

jet:
	@echo "Generating jet files..."
	@go run $(JET_SRC)

# Build the daemon binary
build:
	@echo "Building $(SERVER_NAME) and $(DAEMON_NAME)..."
	@go build -o $(DAEMON_NAME) $(DAEMON_SRC)
	@go build -o $(SERVER_NAME) $(SERVER_SRC)

# Start the daemon
up: build
	@echo "Starting daemon..."
	sudo ./$(DAEMON_NAME) &

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
	@rm -f $(DAEMON_NAME) $(PID_FILE) $(LOG_FILE)
	@rm -f $(SERVER_NAME)

# Run linter (optional, requires golangci-lint)
lint:
	@echo "Running linter..."
	@golangci-lint run ./...

quest:
	@echo "Running quest tests..."
	@echo "Running NATIVE..."
	@go test -bench=. -benchmem ./internal/quest/registry
	@echo "Running YAEGI..."
	@go test -bench=. -benchmem -tags=dev ./internal/quest/registry
	@echo "Quest tests completed."
