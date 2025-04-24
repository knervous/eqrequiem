package config

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
)

//go:embed serverconfig/key.pem
var keyPEMData embed.FS

//go:embed serverconfig/discord.txt
var discordKeyData embed.FS

//go:embed serverconfig/eqemu_config.json
var configData embed.FS

func GetDiscordKey() (string, error) {
	data, err := discordKeyData.ReadFile("serverconfig/discord.txt")
	if err != nil {
		return "", fmt.Errorf("failed to read embedded discord key: %w", err)
	}
	key := strings.TrimSpace(string(data))
	return key, nil
}

func GetCert() (string, error) {
	data, err := keyPEMData.ReadFile("serverconfig/key.pem")
	if err != nil {
		return "", fmt.Errorf("failed to read embedded cert: %w", err)
	}
	key := strings.TrimSpace(string(data))
	return key, nil
}

type Config map[string]interface{}

func NewConfig() (Config, error) {
	data, err := configData.ReadFile("serverconfig/eqemu_config.json")
	if err != nil {
		return nil, err
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return config, nil
}

func (c Config) Get(keyPath string, defaultValue interface{}) interface{} {
	keys := strings.Split(keyPath, ".")
	current := c

	for i, key := range keys {
		if i == len(keys)-1 {
			if value, ok := current[key]; ok {
				return value
			}
			return defaultValue
		}

		if next, ok := current[key].(map[string]interface{}); ok {
			current = next
		} else {
			return defaultValue
		}
	}

	return defaultValue
}

func (c Config) GetString(keyPath string, defaultValue string) string {
	if value, ok := c.Get(keyPath, defaultValue).(string); ok {
		return value
	}
	return defaultValue
}

func (c Config) GetInt(keyPath string, defaultValue int) int {
	// JSON numbers are float64 by default
	if value, ok := c.Get(keyPath, float64(defaultValue)).(float64); ok {
		return int(value)
	}
	return defaultValue
}

func (c Config) GetBool(keyPath string, defaultValue bool) bool {
	if value, ok := c.Get(keyPath, defaultValue).(bool); ok {
		return value
	}
	return defaultValue
}
