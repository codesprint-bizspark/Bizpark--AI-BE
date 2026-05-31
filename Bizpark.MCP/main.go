package main

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/bizspark/mcp/config"
	"github.com/bizspark/mcp/db"
	"github.com/bizspark/mcp/tools"
	"github.com/mark3labs/mcp-go/server"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()
	database, err := db.New(ctx, cfg.CommerceDatabaseURL)
	if err != nil {
		log.Fatalf("Commerce DB connection failed: %v", err)
	}
	defer database.Close()

	// Ensure McpApiKey table exists in Commerce DB public schema
	if err := database.EnsureApiKeyTable(ctx); err != nil {
		log.Fatalf("Failed to create McpApiKey table: %v", err)
	}

	mcpServer := server.NewMCPServer(
		"BizSpark MCP",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions(
			"You are a business assistant for a BizSpark customer. "+
				"You have access to their store data: products, orders, and customers. "+
				"Answer questions about their business clearly and helpfully.",
		),
	)

	tools.Register(mcpServer, database)

	authMiddleware := func(ctx context.Context, r *http.Request) context.Context {
		authHeader := r.Header.Get("Authorization")
		rawKey := strings.TrimPrefix(authHeader, "Bearer ")
		if rawKey == "" || rawKey == authHeader {
			// Fallback for clients that can't set an Authorization header
			// (e.g. claude.ai web custom connectors): accept ?key= query param.
			rawKey = r.URL.Query().Get("key")
		}
		if rawKey == "" {
			return context.WithValue(ctx, tools.BusinessIDKey, "")
		}
		businessID, err := database.ResolveAPIKey(ctx, rawKey)
		if err != nil {
			log.Printf("[sse] auth FAIL on %s: key present but unresolved", r.URL.Path)
			return context.WithValue(ctx, tools.BusinessIDKey, "")
		}
		log.Printf("[sse] auth OK on %s: business=%s", r.URL.Path, businessID)
		return context.WithValue(ctx, tools.BusinessIDKey, businessID)
	}

	addr := ":" + cfg.Port
	sseServer := server.NewSSEServer(mcpServer,
		server.WithBaseURL(cfg.PublicURL),
		server.WithSSEContextFunc(authMiddleware),
	)

	// Mount OAuth endpoints (for claude.ai web connectors) alongside the SSE
	// transport. The SSEServer is an http.Handler that routes /sse and /message;
	// everything else falls through to the OAuth provider's explicit routes.
	mux := http.NewServeMux()
	newOAuthProvider(database, cfg.PublicURL).register(mux)
	mux.Handle("/", sseServer)

	log.Printf("BizSpark MCP server running on %s (public: %s)", addr, cfg.PublicURL)
	log.Printf("Commerce DB: tenant schema per business")

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
