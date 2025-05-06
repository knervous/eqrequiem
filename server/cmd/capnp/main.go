package main

import (
	"bytes"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

// generateGoCapnp scans for .capnp schema files and invokes capnp compile to generate Go bindings.
func generateGoCapnp() error {
	schemaDir := "./internal/api/capnp"

	// Verify capnpc-go plugin
	if _, err := exec.LookPath("capnpc-go"); err != nil {
		return fmt.Errorf("capnpc-go plugin not found: %w. Install with 'go install capnproto.org/go/capnp/v3/capnpc-go@latest'", err)
	}

	// Find all .capnp files under schemaDir
	var schemas []string
	err := filepath.Walk(schemaDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && filepath.Ext(path) == ".capnp" {
			schemas = append(schemas, path)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to scan capnp schema dir: %w", err)
	}
	if len(schemas) == 0 {
		return fmt.Errorf("no .capnp files found in %s", schemaDir)
	}

	// Assemble capnp compile args
	args := []string{
		"compile",
		"-I", schemaDir,
		"-ogo",
	}
	args = append(args, schemas...)

	// Run capnp
	cmd := exec.Command("capnp", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = os.Stdout // Capture stdout for debugging
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("capnp Go generation failed: %v\n%s", err, stderr.String())
	}
	return nil
}

// generateTSCapnp scans for .capnp schema files and invokes capnp compile to generate TypeScript bindings.
func generateTSCapnp() error {
	schemaDir := "./internal/api/capnp"
	tsOutDir := "../client/src/Game/Net"

	// Verify npx is available
	if _, err := exec.LookPath("npx"); err != nil {
		return fmt.Errorf("npx not found: %w. Install Node.js (which includes npx)", err)
	}

	// Gather all .capnp files
	var schemas []string
	if err := filepath.Walk(schemaDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && filepath.Ext(path) == ".capnp" {
			schemas = append(schemas, path)
		}
		return nil
	}); err != nil {
		return fmt.Errorf("scanning capnp dir failed: %w", err)
	}
	if len(schemas) == 0 {
		return fmt.Errorf("no .capnp files found in %s", schemaDir)
	}

	// Build: npx -p capnp-es -p typescript capnp-es -ots:<outdir> <schemas...>
	args := []string{
		"-p", "capnp-es",
		"-p", "typescript",
		"capnp-es",
		"-ots:" + tsOutDir,
	}
	args = append(args, schemas...)

	cmd := exec.Command("npx", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	cmd.Stdout = os.Stdout
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("capnp-es (via npx) failed: %v\n%s", err, stderr.String())
	}

	return nil
}

func main() {
	log.Println("Generating Cap'n Proto bindings...")
	if err := generateGoCapnp(); err != nil {
		log.Fatalf("Failed to generate Go Cap'n Proto bindings: %v", err)
	}
	if err := generateTSCapnp(); err != nil {
		log.Fatalf("Failed to generate TS Cap'n Proto bindings: %v", err)
	}
	log.Println("Cap'n Proto bindings generated successfully.")
}
