package main

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/sevlyar/go-daemon"
)

func main() {
	// Ensure absolute path to binary to avoid relative path issues
	workDir, err := os.Getwd()
	if err != nil {
		log.Fatal("Failed to get working directory: ", err)
	}
	binaryPath := filepath.Join(workDir, "server")

	// Validate binary existence and permissions
	if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
		log.Fatal("Binary does not exist: ", binaryPath)
	}
	if err := ensureExecutable(binaryPath); err != nil {
		log.Fatal("Binary is not executable: ", err)
	}

	// Configure daemon
	cntxt := &daemon.Context{
		PidFileName: "server.pid", // Use .pid extension for clarity
		PidFilePerm: 0644,
		LogFileName: "server.log",
		LogFilePerm: 0640,
		WorkDir:     workDir,
		Umask:       027,
	}

	// Start daemon
	d, err := cntxt.Reborn()
	if err != nil {
		log.Fatal("Unable to run daemon: ", err)
	}
	if d != nil {
		return
	}
	defer cntxt.Release()

	// Main loop to run and restart binary
	for {
		cmd := exec.Command(binaryPath)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr

		log.Printf("Starting %s...", binaryPath)
		err := cmd.Start()
		if err != nil {
			log.Printf("Failed to start: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		// Wait for process to exit
		err = cmd.Wait()
		log.Printf("Process exited with error: %v", err)
		time.Sleep(5 * time.Second)
	}
}

// ensureExecutable checks if the binary is executable and attempts to fix permissions if needed
func ensureExecutable(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.Mode().Perm()&0111 == 0 {
		return os.Chmod(path, 0755)
	}
	return nil
}