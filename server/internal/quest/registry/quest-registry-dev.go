//go:build dev
// +build dev

package questregistry

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"

	"github.com/knervous/eqgo/internal/quest"
	"github.com/knervous/eqgo/internal/quest/yaegi_wrappers"
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

type zoneEntry struct {
	quest   *quest.ZoneQuestInterface
	interp  *interp.Interpreter
	symbols map[string]map[string]reflect.Value
}

var (
	mu            sync.RWMutex
	questRegistry = map[string]*zoneEntry{}
	fileCache     = map[string][]string{}
	fileCacheMu   sync.RWMutex
)

func init() {
	fmt.Println("[dev] quest-registry-dev.go loaded")
}

func isTestEnvironment() bool {
	env := os.Getenv("EQGO_TEST_ENV")
	fmt.Printf("[dev] EQGO_TEST_ENV=%s\n", env)
	return env == "1"
}

func getZoneFiles(moduleRoot, zoneName string) ([]string, error) {
	fileCacheMu.RLock()
	if files, ok := fileCache[zoneName]; ok {
		fileCacheMu.RUnlock()
		return files, nil
	}
	fileCacheMu.RUnlock()

	pattern := fmt.Sprintf("internal/quest/zones/%s/*.go", zoneName)
	fullPattern := fmt.Sprintf("%s/%s", moduleRoot, pattern)
	files, err := filepath.Glob(fullPattern)
	if err != nil {
		return nil, err
	}

	fileCacheMu.Lock()
	fileCache[zoneName] = files
	fileCacheMu.Unlock()
	return files, nil
}

func GetQuestInterface(zoneName string) *quest.ZoneQuestInterface {
	mu.RLock()
	if entry, ok := questRegistry[zoneName]; ok {
		mu.RUnlock()
		return entry.quest
	}
	mu.RUnlock()

	moduleRoot, err := os.Getwd()
	fmt.Println("[dev] moduleRoot:", moduleRoot)
	if err != nil {
		fmt.Printf("Getwd error: %v\n", err)
		return nil
	}

	files, err := getZoneFiles(moduleRoot, zoneName)
	if err != nil {
		fmt.Printf("Glob error: %v\n", err)
		return nil
	}
	if len(files) == 0 {
		fmt.Printf("No quest files found for zone %s\n", zoneName)
		return nil
	}

	sourceFS := os.DirFS(moduleRoot)
	i := interp.New(interp.Options{
		SourcecodeFilesystem: sourceFS,
		Env:                  []string{"GO111MODULE=on"},
		Unrestricted:         true,
		GoPath:               os.Getenv("GOPATH"),
	})
	i.Use(stdlib.Symbols)
	i.Use(yaegi_wrappers.Symbols)

	var mainFile string
	var otherFiles []string
	for _, f := range files {
		if filepath.Base(f) == "main.go" {
			mainFile = f
		} else {
			otherFiles = append(otherFiles, f)
		}
	}
	orderedFiles := append(otherFiles, mainFile)

	fmt.Printf("[dev] Loading zone %s with %d file(s): %v\n", zoneName, len(orderedFiles), orderedFiles)

	for _, f := range orderedFiles {
		rel, err := filepath.Rel(moduleRoot, f)
		if err != nil {
			fmt.Printf("Failed to get relative path for %s: %v\n", f, err)
			continue
		}
		rel = filepath.ToSlash(rel)

		if _, err := i.EvalPath(rel); err != nil {
			fmt.Printf("Failed to eval %s: %v\n", rel, err)
			continue
		}
	}

	symbols := i.Symbols(zoneName)
	v, ok := symbols[zoneName]
	if !ok {
		fmt.Printf("Zone not found in %s\n", zoneName)
		return nil
	}
	zoneVal, ok := v["RegisterZone"]
	if !ok {
		fmt.Printf("RegisterZone not found in zone package %s\n", zoneName)
		return nil
	}

	if zoneVal.Kind() != reflect.Func {
		fmt.Printf("RegisterZone is not a function, got type: %v\n", zoneVal.Kind())
		return nil
	}

	results := zoneVal.Call(nil)
	if len(results) != 1 {
		fmt.Printf("RegisterZone returned unexpected number of results: %d\n", len(results))
		return nil
	}
	zoneQuest, ok := results[0].Interface().(*quest.ZoneQuestInterface)
	if !ok {
		fmt.Printf("ZoneQuests in %s has unexpected type: %T\n", zoneName, zoneVal.Interface())
		return nil
	}

	mu.Lock()
	questRegistry[zoneName] = &zoneEntry{
		quest:   zoneQuest,
		interp:  i,
		symbols: symbols,
	}
	mu.Unlock()

	fmt.Printf("[dev] Registered zone quest: %s\n", zoneName)
	return zoneQuest
}
