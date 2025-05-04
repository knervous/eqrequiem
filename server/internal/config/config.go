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

type Config struct {
	DBHost      string `json:"db_host"`
	DBPort      int    `json:"db_port"`
	DBUser      string `json:"db_user"`
	DBPass      string `json:"db_pass"`
	Local       bool   `json:"local"`
	LocalQuests bool   `json:"localQuests"`
}

func NewConfig() (*Config, error) {
	data, err := configData.ReadFile("serverconfig/eqemu_config.json")
	if err != nil {
		return nil, err
	}

	// Initialize with default values
	config := &Config{
		DBHost:      "127.0.0.1", // Default host
		DBPort:      3306,        // Default MySQL port
		DBUser:      "root",      // Default user
		DBPass:      "",          // Default empty password
		Local:       false,       // Default local setting
		LocalQuests: false,       // Default local setting
	}

	// Unmarshal JSON, overwriting defaults with provided values
	if err := json.Unmarshal(data, config); err != nil {
		return nil, err
	}

	return config, nil
}
