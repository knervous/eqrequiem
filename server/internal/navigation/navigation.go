package nav

import (
	"fmt"
	"os"

	"github.com/arl/go-detour/detour"
)

// GetNavigation returns the instantiated WebAssembly module for recast-navigation.
func GetNavigation() (*detour.NavMesh, error) {
	// Ensure the module is instantiated only once.
	// Read navmesh data from a file
	file, err := os.Open("maps/qeynos2.bin")
	if err != nil {
		return nil, fmt.Errorf("error opening navmesh file: %v", err)
	}
	defer file.Close()
	// Create a new NavMesh
	// Decode the navmesh using detour.Decode
	navMesh, err := detour.Decode(file)
	if err != nil {
		return nil, fmt.Errorf("error decoding navmesh: %v", err)
	}

	fmt.Println("NavMesh loaded successfully!")
	// Initialize the NavMesh with the data
	status, query := detour.NewNavMeshQuery(navMesh, 512) // 512 is the max nodes for the query
	if query == nil {
		return nil, fmt.Errorf("error creating NavMeshQuery")
	}
	fmt.Println("Status", status)
	return navMesh, nil
}
