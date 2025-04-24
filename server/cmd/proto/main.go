package main

import (
	"bytes"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
)

func generateProto() error {

	protoDir := "./internal/api/proto"
	protoFile := filepath.Join(protoDir, "EQMessage.proto")

	// Make sure you've installed the Go plugin:
	//   go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	// and that $GOBIN is in your PATH :contentReference[oaicite:0]{index=0}

	args := []string{
		"-I=" + protoDir,
		"--go_out=" + protoDir,
		"--go_opt=paths=source_relative",
		protoFile,
	}
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
