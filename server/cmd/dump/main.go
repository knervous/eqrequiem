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

func main() {
	host, port, user, pass, dbName, err := getConnection()
	if err != nil {
		log.Fatalf("❌ %v", err)
	}

	outPath := fmt.Sprintf("%s.sql.gz", dbName)

	// create the output file
	f, err := os.Create(outPath)
	if err != nil {
		log.Fatalf("failed to create %s: %v", outPath, err)
	}
	// wrap it in gzip
	gz := gzip.NewWriter(f)

	// build mysqldump
	cmd := exec.Command(
		"mysqldump",
		fmt.Sprintf("--host=%s", host),
		fmt.Sprintf("--port=%s", port),
		fmt.Sprintf("--user=%s", user),
		fmt.Sprintf("--password=%s", pass),
		"--skip-lock-tables", // optional
		dbName,
	)

	// wire stdout → gzip, stderr → your stderr
	cmd.Stdout = gz
	cmd.Stderr = os.Stderr

	// run & block until finished
	if err := cmd.Run(); err != nil {
		gz.Close()
		f.Close()
		log.Fatalf("mysqldump failed: %v", err)
	}

	// make sure the gzip footer is written
	if err := gz.Close(); err != nil {
		f.Close()
		log.Fatalf("failed to close gzip writer: %v", err)
	}
	if err := f.Close(); err != nil {
		log.Fatalf("failed to close output file: %v", err)
	}

	log.Printf("✅ Dump complete: %s\n", outPath)
}
