package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/bizspark/mcp/db"
	"github.com/bizspark/mcp/tools"
	"github.com/mark3labs/mcp-go/server"
)

// authContext resolves the Bearer token (or ?key= fallback) to a businessId and
// stores it in the context for the tool handlers. Shared by both transports:
// the SSE context func (mcp-remote / Claude Desktop) and the Streamable HTTP
// handler (claude.ai web).
func authContext(ctx context.Context, r *http.Request, database *db.DB) context.Context {
	authHeader := r.Header.Get("Authorization")
	rawKey := strings.TrimPrefix(authHeader, "Bearer ")
	if rawKey == "" || rawKey == authHeader {
		rawKey = r.URL.Query().Get("key")
	}
	if rawKey == "" {
		log.Printf("[auth] %s %s: no key/token", r.Method, r.URL.Path)
		return context.WithValue(ctx, tools.BusinessIDKey, "")
	}
	businessID, err := database.ResolveAPIKey(ctx, rawKey)
	if err != nil {
		log.Printf("[auth] %s %s: key present but unresolved", r.Method, r.URL.Path)
		return context.WithValue(ctx, tools.BusinessIDKey, "")
	}
	log.Printf("[auth] %s %s: business=%s", r.Method, r.URL.Path, businessID)
	return context.WithValue(ctx, tools.BusinessIDKey, businessID)
}

// streamableHTTPHandler implements the MCP "Streamable HTTP" transport used by
// claude.ai web custom connectors: a single endpoint that accepts a JSON-RPC
// message via POST and returns the JSON-RPC response as application/json.
// Our tools are stateless request/response, so no session is required.
func streamableHTTPHandler(mcpServer *server.MCPServer, database *db.DB, publicURL string) http.HandlerFunc {
	resourceMeta := strings.TrimSuffix(publicURL, "/") + "/.well-known/oauth-protected-resource/sse"
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodOptions:
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id")
			w.WriteHeader(http.StatusNoContent)

		case http.MethodPost:
			body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
			if err != nil {
				http.Error(w, "read error", http.StatusBadRequest)
				return
			}
			ctx := authContext(r.Context(), r, database)
			w.Header().Set("Access-Control-Allow-Origin", "*")

			// Per the MCP authorization spec, an unauthenticated request must be
			// rejected with 401 + WWW-Authenticate so the client knows to run the
			// OAuth flow and retry WITH a bearer token.
			if bizID, _ := ctx.Value(tools.BusinessIDKey).(string); bizID == "" {
				w.Header().Set("WWW-Authenticate",
					`Bearer resource_metadata="`+resourceMeta+`"`)
				writeJSON(w, http.StatusUnauthorized, map[string]any{
					"error":             "unauthorized",
					"error_description": "a valid bearer token is required",
				})
				return
			}

			resp := mcpServer.HandleMessage(ctx, body)
			if resp == nil {
				// Notification / response — nothing to return.
				w.WriteHeader(http.StatusAccepted)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(resp)

		case http.MethodGet:
			// We don't push server-initiated messages, so no SSE stream is
			// offered on this endpoint (allowed by the spec).
			w.WriteHeader(http.StatusMethodNotAllowed)

		case http.MethodDelete:
			// Session termination — we're stateless, so just acknowledge.
			w.WriteHeader(http.StatusNoContent)

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}
}
