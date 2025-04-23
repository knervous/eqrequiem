package cache

import (
	"errors"
	"log"
	"sync"
	"time"

	"github.com/dgraph-io/ristretto/v2"
)

var (
	ErrCacheNotInitialized = errors.New("cache not initialized")
	ErrInvalidConfig       = errors.New("invalid cache configuration")
)

type Cache struct {
	cache *ristretto.Cache[string, interface{}]
	mu    sync.RWMutex
	once  sync.Once
}

var cacheInstance = &Cache{}

func Init() error {
	const numCounters = 1e7
	const maxCost = 1 << 30 // 1GB
	const bufferItems = 64
	cacheInstance.once.Do(func() {
		if numCounters <= 0 || maxCost <= 0 || bufferItems <= 0 {
			log.Fatalf("cache initialization failed: %v", ErrInvalidConfig)
		}

		cfg := &ristretto.Config[string, interface{}]{
			NumCounters: numCounters,
			MaxCost:     maxCost,
			BufferItems: bufferItems,
			Metrics:     true,
		}

		cache, err := ristretto.NewCache(cfg)
		if err != nil {
			log.Fatalf("failed to initialize Ristretto cache: %v", err)
		}

		cacheInstance.mu.Lock()
		cacheInstance.cache = cache
		cacheInstance.mu.Unlock()
	})

	return nil
}

// GetCache returns the singleton cache instance.
func GetCache() *Cache {
	return cacheInstance
}

func (c *Cache) Set(key string, value interface{}) (bool, error) {
	return c.SetWithOptions(key, value, 100, time.Hour*1)
}

// Set adds a value with cost and optional per-item TTL.
// Returns true if the value was accepted into the buffer, or an error if the cache is uninitialized.
func (c *Cache) SetWithOptions(key string, value interface{}, cost int64, ttl time.Duration) (bool, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.cache == nil {
		return false, ErrCacheNotInitialized
	}

	if ttl > 0 {
		return c.cache.SetWithTTL(key, value, cost, ttl), nil
	}
	return c.cache.Set(key, value, cost), nil
}

// Delete removes a key from the cache.
// Returns an error if the cache is uninitialized.
func (c *Cache) Delete(key string) error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.cache == nil {
		return ErrCacheNotInitialized
	}

	c.cache.Del(key)
	return nil
}

// Get retrieves a value if present, or an error if the cache is uninitialized.
func (c *Cache) Get(key string) (interface{}, bool, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.cache == nil {
		return nil, false, ErrCacheNotInitialized
	}
	value, found := c.cache.Get(key)
	return value, found, nil
}

// Metrics returns the cache metrics for monitoring hit/miss rates.
func (c *Cache) Metrics() *ristretto.Metrics {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.cache == nil {
		return nil
	}
	return c.cache.Metrics
}

// Close releases the cache resources.
func (c *Cache) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.cache != nil {
		c.cache.Close()
		c.cache = nil
	}
}
