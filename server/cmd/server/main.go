package main

import (
	"fmt"
	"knervous/eqgo/internal/config"
	"knervous/eqgo/internal/db"
	items "knervous/eqgo/internal/db/items"
	"knervous/eqgo/internal/server"
	"log"
	"os"
	"os/signal"
	"syscall"

	_ "github.com/go-sql-driver/mysql" // Import MySQL driver
)

func getConnectionString() (string, error) {
	serverConfig, err := config.NewConfig()
	if err != nil {
		return "", fmt.Errorf("failed to read config: %v", err)
	}
	host := serverConfig.GetString("db_host", "")
	user := serverConfig.GetString("db_user", "")
	pass := serverConfig.GetString("db_pass", "")
	port := serverConfig.GetInt("db_port", 3307)

	if host == "" || user == "" || pass == "" {
		return "", fmt.Errorf("database connection string is not set")
	}
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/eqgo?parseTime=true", user, pass, host, port), nil

}

func main() {
	dsn, err := getConnectionString()
	if err != nil {
		log.Fatalf("failed to read connection string: %v", err)
	}
	if err := db.InitWorldDB(dsn); err != nil {
		log.Fatalf("failed to initialize db.WorldDB: %v", err)
	}

	items.InitializeItemsMMF()
	item, _ := items.GetItemTemplateByID(1003)
	fmt.Println(item)
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
