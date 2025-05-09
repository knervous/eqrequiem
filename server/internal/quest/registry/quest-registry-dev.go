//go:build dev
// +build dev

package questregistry

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"

	"github.com/fsnotify/fsnotify"
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
	// protects questRegistry
	mu            sync.RWMutex
	questRegistry = map[string]*zoneEntry{}

	// simple filesystem glob cache
	fileCache   = map[string][]string{}
	fileCacheMu sync.RWMutex

	// for reload callbacks
	callbackMu      sync.Mutex
	reloadCallbacks = map[string][]func(*quest.ZoneQuestInterface){}

	// one fsnotify.Watcher per zone
	watcherMu sync.Mutex
	watchers  = map[string]*fsnotify.Watcher{}
)

func init() {
	fmt.Println("[dev] quest-registry-dev.go loaded")
}

// IsDev marks this build as dev-enabled.
func IsDev() bool {
	return true
}

// RegisterReload lets you pass in a callback that will fire with
// the new *ZoneQuestInterface pointer whenever that zone’s files change.
func RegisterReload(zoneName string, cb func(*quest.ZoneQuestInterface)) {
	callbackMu.Lock()
	reloadCallbacks[zoneName] = append(reloadCallbacks[zoneName], cb)
	callbackMu.Unlock()

	// ensure we have a watcher running for this zone
	moduleRoot, err := os.Getwd()
	if err != nil {
		fmt.Printf("[dev] RegisterReload: Getwd error: %v\n", err)
		return
	}
	if err := watchZoneFiles(moduleRoot, zoneName); err != nil {
		fmt.Printf("[dev] RegisterReload: watch error for %s: %v\n", zoneName, err)
	}
}

// GetQuestInterface is unchanged from before: loads on first call, caches thereafter.
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
		fmt.Printf("[dev] GetQuestInterface Getwd error: %v\n", err)
		return nil
	}

	entry, err := loadZoneEntry(moduleRoot, zoneName)
	if err != nil {
		fmt.Printf("[dev] loadZoneEntry error for %s: %v\n", zoneName, err)
		return nil
	}

	mu.Lock()
	questRegistry[zoneName] = entry
	mu.Unlock()
	fmt.Printf("[dev] Registered zone quest: %s\n", zoneName)

	// start watching for future hot-reloads
	if err := watchZoneFiles(moduleRoot, zoneName); err != nil {
		fmt.Printf("[dev] could not watch zone %s: %v\n", zoneName, err)
	}

	return entry.quest
}

// loadZoneEntry encapsulates the Yaegi logic to produce a fresh zoneEntry.
func loadZoneEntry(moduleRoot, zoneName string) (*zoneEntry, error) {
	files, err := getZoneFiles(moduleRoot, zoneName)
	if err != nil {
		return nil, fmt.Errorf("glob error: %w", err)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no quest files found for zone %s", zoneName)
	}

	fs := os.DirFS(moduleRoot)
	i := interp.New(interp.Options{
		SourcecodeFilesystem: fs,
		Env:                  []string{"GO111MODULE=on"},
		Unrestricted:         true,
		GoPath:               os.Getenv("GOPATH"),
	})
	i.Use(stdlib.Symbols)
	i.Use(yaegi_wrappers.Symbols)

	// load all .go files, with main.go last
	var mainFile string
	var others []string
	for _, f := range files {
		if filepath.Base(f) == "main.go" {
			mainFile = f
		} else {
			others = append(others, f)
		}
	}
	ordered := append(others, mainFile)

	fmt.Printf("[dev] Loading zone %s files: %v\n", zoneName, ordered)
	for _, f := range ordered {
		rel, err := filepath.Rel(moduleRoot, f)
		if err != nil {
			fmt.Printf("[dev]   rel error %s: %v\n", f, err)
			continue
		}
		rel = filepath.ToSlash(rel)
		if _, err := i.EvalPath(rel); err != nil {
			fmt.Printf("[dev]   eval error %s: %v\n", rel, err)
		}
	}

	syms := i.Symbols(zoneName)
	pkg, ok := syms[zoneName]
	if !ok {
		return nil, fmt.Errorf("zone package %s not found", zoneName)
	}
	regFunc, ok := pkg["RegisterZone"]
	if !ok || regFunc.Kind() != reflect.Func {
		return nil, fmt.Errorf("RegisterZone func not found in %s", zoneName)
	}
	results := regFunc.Call(nil)
	if len(results) != 1 {
		return nil, fmt.Errorf("RegisterZone returned %d results", len(results))
	}
	zqi, ok := results[0].Interface().(*quest.ZoneQuestInterface)
	if !ok {
		return nil, fmt.Errorf("RegisterZone did not return *ZoneQuestInterface")
	}

	return &zoneEntry{quest: zqi, interp: i, symbols: syms}, nil
}

// getZoneFiles globs the zone’s .go files, with simple caching.
func getZoneFiles(moduleRoot, zoneName string) ([]string, error) {
	fileCacheMu.RLock()
	if files, ok := fileCache[zoneName]; ok {
		fileCacheMu.RUnlock()
		return files, nil
	}
	fileCacheMu.RUnlock()

	pattern := filepath.Join(moduleRoot, "internal/quest/zones", zoneName, "*.go")
	files, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}

	fileCacheMu.Lock()
	fileCache[zoneName] = files
	fileCacheMu.Unlock()
	return files, nil
}

// watchZoneFiles creates one fsnotify.Watcher per zone directory,
// and fires reloadZone on any Create/Write/Remove/Rename.
func watchZoneFiles(moduleRoot, zoneName string) error {
	watcherMu.Lock()
	defer watcherMu.Unlock()

	if _, exists := watchers[zoneName]; exists {
		return nil
	}

	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	watchers[zoneName] = w

	dir := filepath.Join(moduleRoot, "internal/quest/zones", zoneName)
	if err := w.Add(dir); err != nil {
		return fmt.Errorf("watch add %s: %w", dir, err)
	}

	go func() {
		for {
			select {
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if ev.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) != 0 {
					reloadZone(zoneName)
				}
			case err, ok := <-w.Errors:
				if !ok {
					return
				}
				fmt.Printf("[dev] watcher error for %s: %v\n", zoneName, err)
			}
		}
	}()

	return nil
}

// reloadZone does a fresh load, replaces the registry entry,
// and then invokes any user-registered reload callbacks.
func reloadZone(zoneName string) {
	fmt.Printf("[dev] *** hot-reloading zone %s ***\n", zoneName)

	moduleRoot, err := os.Getwd()
	if err != nil {
		fmt.Printf("[dev] reload Getwd error: %v\n", err)
		return
	}

	newEntry, err := loadZoneEntry(moduleRoot, zoneName)
	if err != nil {
		fmt.Printf("[dev] reload loadZoneEntry error: %v\n", err)
		return
	}

	// swap into the registry so subsequent GetQuestInterface sees the new one
	mu.Lock()
	questRegistry[zoneName] = newEntry
	mu.Unlock()

	// fire callbacks (if any)
	callbackMu.Lock()
	cbs := reloadCallbacks[zoneName]
	callbackMu.Unlock()
	for _, cb := range cbs {
		cb(newEntry.quest)
	}
}
