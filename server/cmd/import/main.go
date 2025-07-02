package main

import (
	"compress/gzip"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
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

func fetchGzipFromURL(url string) (io.ReadCloser, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch URL %s: %v", url, err)
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("unexpected status code %d for URL %s", resp.StatusCode, url)
	}
	return resp.Body, nil
}

func main() {
	// Define CLI flag for URL
	urlPtr := flag.String("url", "https://eqrequiem.blob.core.windows.net/dev/eqgo.sql.gz", "URL of the gzip database dump")
	filePtr := flag.String("file", "", "Local file path of the gzip database dump")
	flag.Parse()

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

	// 2) Get gzip reader
	var gr *gzip.Reader
	if *filePtr != "" {
		// Read from local file
		f, err := os.Open(*filePtr)
		if err != nil {
			log.Fatalf("failed to open %s: %v", *filePtr, err)
		}
		defer f.Close()
		gr, err = gzip.NewReader(f)
		if err != nil {
			log.Fatalf("failed to create gzip reader: %v", err)
		}
	} else {
		// Fetch from URL
		body, err := fetchGzipFromURL(*urlPtr)
		if err != nil {
			log.Fatalf("failed to fetch from URL: %v", err)
		}
		defer body.Close()
		gr, err = gzip.NewReader(body)
		if err != nil {
			log.Fatalf("failed to create gzip reader: %v", err)
		}
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

	log.Printf("✅ Import complete from %s\n", *urlPtr)
}
