package main

import (
	"compress/gzip"
	"fmt"
	"log"
	"os"
	"os/exec"

	"github.com/knervous/eqgo/internal/config"
)

func getConnection() (host, port, user, pass, dbName string, err error) {
	cfg, err := config.Get()
	if err != nil {
		return "", "", "", "", "", fmt.Errorf("failed to read config: %v", err)
	}
	host, port, user, pass, dbName = cfg.DBHost, fmt.Sprintf("%d", cfg.DBPort), cfg.DBUser, cfg.DBPass, "eqgo"
	if host == "" || user == "" || pass == "" || dbName == "" {
		return "", "", "", "", "", fmt.Errorf("database connection details are not set")
	}
	return
}

func mustRun(cmd *exec.Cmd) {
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		log.Fatalf("command %v failed: %v", cmd.Args, err)
	}
}

func main() {
	host, port, user, pass, dbName, err := getConnection()
	if err != nil {
		log.Fatalf("❌ %v", err)
	}

	// 1) Ensure DB exists
	createArgs := []string{
		fmt.Sprintf("--host=%s", host),
		fmt.Sprintf("--port=%s", port),
		fmt.Sprintf("--user=%s", user),
		fmt.Sprintf("--password=%s", pass),
		"-e", fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s`;", dbName),
	}
	mustRun(exec.Command("mysql", createArgs...))
	log.Printf("✅ Database `%s` ensured\n", dbName)

	// 2) Open gzip dump
	inPath := fmt.Sprintf("%s.sql.gz", dbName)
	f, err := os.Open(inPath)
	if err != nil {
		log.Fatalf("failed to open %s: %v", inPath, err)
	}
	defer f.Close()

	gr, err := gzip.NewReader(f)
	if err != nil {
		log.Fatalf("failed to create gzip reader: %v", err)
	}
	defer gr.Close()

	// 3) Import into the DB
	importArgs := []string{
		fmt.Sprintf("--host=%s", host),
		fmt.Sprintf("--port=%s", port),
		fmt.Sprintf("--user=%s", user),
		fmt.Sprintf("--password=%s", pass),
		dbName,
	}
	cmd := exec.Command("mysql", importArgs...)
	cmd.Stdin = gr
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		log.Fatalf("mysql import failed: %v", err)
	}

	log.Printf("✅ Import complete from %s\n", inPath)
}
