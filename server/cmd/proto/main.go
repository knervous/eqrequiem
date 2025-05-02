package main

import (
	"bytes"
	"fmt"
	"io/fs"
	"log"
	"os/exec"
	"path/filepath"
	"strings"
)

func generateProto() error {
	protoDir := "./internal/api/proto"

	// 1. find all .proto files under protoDir
	var protos []string
	err := filepath.Walk(protoDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && filepath.Ext(path) == ".proto" && !strings.Contains(path, "google") {
			protos = append(protos, path)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to scan proto dir: %v", err)
	}

	// 2. assemble protoc args
	args := []string{"-I=" + protoDir}
	args = append(args,
		"--go_out="+protoDir,
		"--go_opt=paths=source_relative",
	)
	args = append(args, protos...)

	// 3. run protoc
	cmd := exec.Command("protoc", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("protoc failed: %v\n%s", err, stderr.String())
	}

	return nil
}

func main() {
	err := generateProto()
	if err != nil {
		log.Fatalf("failed to generate protobuf bindings: %v", err)
	}

	log.Println("Protobuf bindings generated successfully in ./internal/api/proto/EQMessage.pb.go")
}
