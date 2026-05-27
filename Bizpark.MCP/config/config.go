package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	CommerceDatabaseURL string // Neon Commerce DB — tenant schemas + McpApiKey
	Port                string
	PublicURL           string // Public base URL advertised to MCP clients (SSE endpoint event)
}

func Load() *Config {
	_ = godotenv.Load("../Bizpark.Commerce/.env")
	_ = godotenv.Load(".env") // local override if exists

	commerceURL := os.Getenv("COMMERCE_DATABASE_URL")
	if commerceURL == "" {
		log.Fatal("COMMERCE_DATABASE_URL is required")
	DatabaseURL string
	Port        string
}

func Load() *Config {
	_ = godotenv.Load("../.env")

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	port := os.Getenv("MCP_PORT")
	if port == "" {
		port = "3004"
	}

	// The SSE transport tells the client where to POST messages via the
	// `endpoint` event. For remote clients this MUST be the public URL the
	// client reached us on — not localhost. Defaults to localhost for dev.
	publicURL := os.Getenv("MCP_PUBLIC_URL")
	if publicURL == "" {
		publicURL = "http://localhost:" + port
	}

	return &Config{
		CommerceDatabaseURL: commerceURL,
		Port:                port,
		PublicURL:           publicURL,
	return &Config{
		DatabaseURL: dbURL,
		Port:        port,
	}
}
