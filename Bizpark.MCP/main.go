package main

import (
	"context"
	"log"
	"net/http"

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
		return authContext(ctx, r, database)
	}

	addr := ":" + cfg.Port
	sseServer := server.NewSSEServer(mcpServer,
		server.WithBaseURL(cfg.PublicURL),
		server.WithSSEContextFunc(authMiddleware),
	)
	streamable := streamableHTTPHandler(mcpServer, database, cfg.PublicURL)

	// Mount the transports + OAuth endpoints.
	//   GET  /sse      → SSE transport      (mcp-remote / Claude Desktop)
	//   POST /sse      → Streamable HTTP    (claude.ai web custom connectors)
	//   POST /message  → SSE message channel (mcp-remote)
	//   /oauth/*, /.well-known/* → OAuth (claude.ai web)
	mux := http.NewServeMux()
	// OAuth (claude.ai web custom connectors require it).
	newOAuthProvider(database, cfg.PublicURL).register(mux)
	// /mcp = Streamable HTTP transport for claude.ai web (POST JSON-RPC; GET →
	// 405 so the client uses pure POST, avoiding the SSE "endpoint" event).
	mux.HandleFunc("/mcp", streamable)
	// /sse + /message = legacy HTTP+SSE transport for mcp-remote / Claude Desktop.
	mux.Handle("/sse", sseServer)
	mux.Handle("/message", sseServer)
	mux.Handle("/", sseServer)

	// Log every request so we can see exactly what a client does post-OAuth.
	logged := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[req] %s %s auth=%t", r.Method, r.URL.Path, r.Header.Get("Authorization") != "")
		mux.ServeHTTP(w, r)
	})

	log.Printf("BizSpark MCP server running on %s (public: %s)", addr, cfg.PublicURL)
	log.Printf("Commerce DB: tenant schema per business")

	if err := http.ListenAndServe(addr, logged); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
