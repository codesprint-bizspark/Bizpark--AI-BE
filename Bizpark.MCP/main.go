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
	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("DB connection failed: %v", err)
	}
	defer database.Close()

	mcpServer := server.NewMCPServer(
		"BizSpark MCP",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithInstructions(
			"You are a business assistant for a BizSpark customer. "+
				"You have access to their business data: social posts, Google reviews, "+
				"website content, and connected social accounts. "+
				"Answer questions about their business clearly and helpfully.",
		),
	)

	tools.Register(mcpServer, database)

	// WithContextFunc — validates the API key and injects businessId into context
	// before each MCP request is processed.
	authMiddleware := func(ctx context.Context, r *http.Request) context.Context {
		authHeader := r.Header.Get("Authorization")
		rawKey := strings.TrimPrefix(authHeader, "Bearer ")
		if rawKey == "" || rawKey == authHeader {
			return context.WithValue(ctx, tools.BusinessIDKey, "")
		}
		businessID, err := database.ResolveAPIKey(ctx, rawKey)
		if err != nil {
			return context.WithValue(ctx, tools.BusinessIDKey, "")
		}
		return context.WithValue(ctx, tools.BusinessIDKey, businessID)
	}

	addr := ":" + cfg.Port
	sseServer := server.NewSSEServer(mcpServer,
		server.WithBaseURL("http://localhost"+addr),
		server.WithSSEContextFunc(authMiddleware),
	)

	log.Printf("BizSpark MCP server listening on %s", addr)
	log.Printf("SSE endpoint:  http://localhost%s/sse", addr)
	log.Printf("POST endpoint: http://localhost%s/message", addr)

	if err := sseServer.Start(addr); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
