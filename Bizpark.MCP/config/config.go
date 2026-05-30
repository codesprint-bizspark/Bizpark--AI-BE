package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	CommerceDatabaseURL string // Neon Commerce DB — tenant schemas + McpApiKey
	Port                string
}

func Load() *Config {
	_ = godotenv.Load("../Bizpark.Commerce/.env")
	_ = godotenv.Load(".env") // local override if exists

	commerceURL := os.Getenv("COMMERCE_DATABASE_URL")
	if commerceURL == "" {
		log.Fatal("COMMERCE_DATABASE_URL is required")
	}

	port := os.Getenv("MCP_PORT")
	if port == "" {
		port = "3004"
	}

	return &Config{
		CommerceDatabaseURL: commerceURL,
		Port:                port,
	}
}
