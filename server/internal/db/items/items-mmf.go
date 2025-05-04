package items

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/knervous/eqgo/internal/db"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/model"
	"github.com/knervous/eqgo/internal/db/jetgen/eqgo/table"

	_ "github.com/go-sql-driver/mysql"

	"github.com/edsrzf/mmap-go"
)

// ItemsFile is the constant filename for the items data file
const ItemsFile = "./items.dat"

// OwnerType represents the type of owner for an item instance
type OwnerType uint8

// Constants for owner types
const (
	OwnerTypeCharacter OwnerType = 0
	OwnerTypeMerchant  OwnerType = 1
	OwnerTypeGuild     OwnerType = 2
)

// Mods represents the JSON structure of the mods field
type Mods struct {
	Enchantment string `json:"enchantment"`
	Durability  int    `json:"durability"`
	// Add other fields as needed
}

// ItemInstance represents a domain model for item_instances
type ItemInstance struct {
	ID        int32
	ItemID    int32
	Mods      Mods // Rich type for JSON
	Charges   uint8
	Quantity  uint8
	OwnerID   *uint32
	OwnerType OwnerType
	Item      model.Items
}

// ItemsMMF manages the memory-mapped file
type ItemsMMF struct {
	data       mmap.MMap
	recordSize int32           // Size of each record
	idToIndex  map[int32]int32 // Map of ItemsBinary.ID to record index
}

// singleton instance
var (
	instance *ItemsMMF
	once     sync.Once
)

// getItemsFilePath resolves the path to items.dat relative to the executable
func getItemsFilePath() string {
	exe, err := os.Getwd()
	if err != nil {
		panic(err) // Handle appropriately in production
	}
	return filepath.Join(filepath.Dir(exe), ItemsFile)
}

// GetItemsMMF returns the singleton instance of the memory-mapped file
func InitializeItemsMMF() (*ItemsMMF, error) {
	var initErr error
	once.Do(func() {
		instance, initErr = openItemsMMF()
	})
	if initErr != nil {
		return nil, initErr
	}
	return instance, nil
}
func getDefaultItems() ([]model.Items, error) {
	var items []model.Items

	err := table.Items.
		SELECT(table.Items.AllColumns).
		FROM(table.Items).
		Query(db.GlobalWorldDB.DB, &items)
	if err != nil {
		return nil, errors.New("failed to query items ")
	}
	if len(items) == 0 {
		return nil, errors.New("no items found in the database")
	}
	return items, nil
}

func openItemsMMF() (*ItemsMMF, error) {
	// Check if items.dat exists
	if _, err := os.Stat(getItemsFilePath()); os.IsNotExist(err) {
		fmt.Println("items.dat not found in folder, creating a new one...", getItemsFilePath())
		defaultItems, err := getDefaultItems()
		if err != nil {
			return nil, err
		}
		if err := WriteItemsToFile(defaultItems); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err // Other errors (e.g., permission denied)
	}
	file, err := os.Open(getItemsFilePath())
	if err != nil {
		return nil, err
	}
	defer file.Close()

	data, err := mmap.Map(file, mmap.RDONLY, 0)
	if err != nil {
		return nil, err
	}

	// Calculate record size
	var sample ItemsBinary
	recordSize := int32(binary.Size(&sample))

	// Initialize the ID-to-index map
	idToIndex := make(map[int32]int32)
	numRecords := int32(len(data)) / recordSize

	// Scan the file to populate the ID-to-index map
	for i := int32(0); i < numRecords; i++ {
		var binaryItem ItemsBinary
		buf := bytes.NewReader(data[i*recordSize : (i+1)*recordSize])
		if err := binary.Read(buf, binary.LittleEndian, &binaryItem); err != nil {
			data.Unmap() // Clean up on error
			return nil, err
		}
		idToIndex[binaryItem.ID] = i
	}

	return &ItemsMMF{
		data:       data,
		recordSize: recordSize,
		idToIndex:  idToIndex,
	}, nil
}

// Close unmaps the memory-mapped file
func (m *ItemsMMF) Close() error {
	return m.data.Unmap()
}
