package main

import (
	"io"
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

	// Configure daemon: NO log file specified → no .log will be created
	cntxt := &daemon.Context{
		PidFileName: "server.pid",
		PidFilePerm: 0644,
		WorkDir:     workDir,
		Umask:       027,
	}

	d, err := cntxt.Reborn()
	if err != nil {
		log.Fatal("Unable to run daemon: ", err)
	}
	if d != nil {
		// parent exits
		return
	}
	defer cntxt.Release()

	// *** Child process from here on ***

	// Silence the Go logger entirely
	log.SetOutput(io.Discard)

	// Pre-open /dev/null for redirecting stdout/stderr
	devNull, err := os.OpenFile(os.DevNull, os.O_RDWR, 0)
	if err != nil {
		// fallback: keep using discarded logger
		devNull = nil
	}
	defer func() {
		if devNull != nil {
			devNull.Close()
		}
	}()

	for {
		cmd := exec.Command(binaryPath)

		// Redirect both stdout and stderr to /dev/null
		if devNull != nil {
			cmd.Stdout = devNull
			cmd.Stderr = devNull
		} else {
			// as fallback, still discard via logger
			cmd.Stdout = io.Discard
			cmd.Stderr = io.Discard
		}

		// start and wait
		if err := cmd.Start(); err != nil {
			// even though logger is discarded, we can fallback to panic
			panic("Failed to start server: " + err.Error())
		}

		_ = cmd.Wait()
		// simple back-off before restart
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
