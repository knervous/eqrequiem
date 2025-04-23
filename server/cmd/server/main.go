package main

import (
	"embed"
	"fmt"
	"knervous/eqgo/internal/server"
	"knervous/eqgo/internal/world"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	_ "github.com/go-sql-driver/mysql" // Import MySQL driver
)

//go:embed keys/connection.txt
var connectionString embed.FS

func getConnectionString() (string, error) {
	data, err := connectionString.ReadFile("keys/connection.txt")
	if err != nil {
		return "", fmt.Errorf("failed to read embedded discord key: %w", err)
	}
	connString := strings.TrimSpace(string(data))
	return connString, nil
}

func main() {
	dsn, err := getConnectionString()
	if err != nil {
		log.Fatalf("failed to read connection string: %v", err)
	}
	if err := world.InitWorldDB(dsn); err != nil {
		log.Fatalf("failed to initialize WorldDB: %v", err)
	}

	srv, err := server.NewServer(dsn)
	if err != nil {
		log.Fatalf("failed to create server: %v", err)
	}
	go srv.StartServer()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	log.Println("Received shutdown signal, shutting down...")

	srv.StopServer()
}
