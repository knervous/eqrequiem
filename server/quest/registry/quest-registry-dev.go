//go:build dev
// +build dev

package questregistry

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/knervous/eqgo/quest"
	"github.com/knervous/eqgo/quest/yaegi_wrappers"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

var (
	mu            sync.RWMutex
	questRegistry = map[string]*quest.ZoneQuestInterface{}
)

func init() {
	fmt.Println("[dev] quest-registry-dev.go loaded")
}

func GetQuestInterface(zoneName string) *quest.ZoneQuestInterface {
	mu.RLock()
	if q, ok := questRegistry[zoneName]; ok {
		mu.RUnlock()
		return q
	}
	mu.RUnlock()

	moduleRoot, err := os.Getwd()
	if err != nil {
		fmt.Printf("Getwd error: %v\n", err)
		return nil
	}

	sourceFS := os.DirFS(moduleRoot)
	pattern := fmt.Sprintf("quests/zones/%s/*.go", zoneName)
	fullPattern := fmt.Sprintf("%s/%s", moduleRoot, pattern)

	files, err := filepath.Glob(fullPattern)
	if err != nil {
		fmt.Printf("Glob error: %v\n", err)
		return nil
	}
	if len(files) == 0 {
		fmt.Printf("No quest files found for zone %s\n", zoneName)
		return nil
	}

	i := interp.New(interp.Options{
		SourcecodeFilesystem: sourceFS,
		Unrestricted:         true,
		GoPath:               os.Getenv("GOPATH"),
	})
	i.Use(stdlib.Symbols)
	i.Use(yaegi_wrappers.Symbols)

	fmt.Printf("[dev] Loading zone %s with %d file(s)...\n", zoneName, len(files))

	for _, f := range files {
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
	zoneVal, ok := v["RegisterZone()"]
	if !ok {
		fmt.Printf("RegisterZone not found in zone package %s\n", zoneName)
		return nil
	}

	zoneQuest, ok := zoneVal.Interface().(*quest.ZoneQuestInterface)
	if !ok {
		fmt.Printf("ZoneQuests in %s has unexpected type: %T\n", zoneName, zoneVal.Interface())
		return nil
	}

	mu.Lock()
	questRegistry[zoneName] = zoneQuest
	mu.Unlock()

	fmt.Printf("[dev] Registered zone quest: %s\n", zoneName)
	return zoneQuest
}
