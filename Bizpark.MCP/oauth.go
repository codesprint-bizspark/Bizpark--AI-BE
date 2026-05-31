package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/bizspark/mcp/db"
)

// oauthProvider implements a minimal OAuth 2.0 Authorization Server so that
// claude.ai web custom connectors (which require OAuth and cannot send a static
// Authorization header) can connect to the MCP server.
//
// The flow is intentionally thin: the merchant's existing AI Connect API key
// (biz_mcp_…) IS the bearer token. On the consent screen the merchant pastes
// their key; we validate it, issue a single-use auth code (PKCE-bound), and the
// /token endpoint returns the key itself as the access_token. The SSE auth
// middleware already resolves a Bearer key → businessId, so nothing downstream
// changes.
type oauthProvider struct {
	db        *db.DB
	publicURL string
	mu        sync.Mutex
	codes     map[string]authCode
}

type authCode struct {
	apiKey        string
	codeChallenge string
	redirectURI   string
	expiresAt     time.Time
}

func newOAuthProvider(database *db.DB, publicURL string) *oauthProvider {
	return &oauthProvider{
		db:        database,
		publicURL: strings.TrimSuffix(publicURL, "/"),
		codes:     map[string]authCode{},
	}
}

func (p *oauthProvider) register(mux *http.ServeMux) {
	mux.HandleFunc("/.well-known/oauth-authorization-server", p.handleASMetadata)
	mux.HandleFunc("/.well-known/oauth-protected-resource", p.handleResourceMetadata)
	// Path-scoped variant (RFC 9728): clients probe /.well-known/oauth-protected-resource/<path>.
	mux.HandleFunc("/.well-known/oauth-protected-resource/", p.handleResourceMetadata)
	mux.HandleFunc("/oauth/register", p.handleRegister)
	mux.HandleFunc("/oauth/authorize", p.handleAuthorize)
	mux.HandleFunc("/oauth/token", p.handleToken)
}

// ── helpers ─────────────────────────────────────────────────────────────────

func randToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func cors(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func isLocalhost(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

// allowedRedirect guards against open-redirect / phishing: only Claude's hosts
// (and localhost, for desktop) may receive an auth code.
func allowedRedirect(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if u.Scheme == "http" {
		return isLocalhost(host)
	}
	if u.Scheme != "https" {
		return false
	}
	if isLocalhost(host) {
		return true
	}
	for _, d := range []string{"claude.ai", "claude.com", "anthropic.com"} {
		if host == d || strings.HasSuffix(host, "."+d) {
			return true
		}
	}
	return false
}

// ── metadata (RFC 8414 / RFC 9728) ────────────────────────────────────────────

func (p *oauthProvider) handleASMetadata(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                                p.publicURL,
		"authorization_endpoint":                p.publicURL + "/oauth/authorize",
		"token_endpoint":                        p.publicURL + "/oauth/token",
		"registration_endpoint":                 p.publicURL + "/oauth/register",
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code"},
		"code_challenge_methods_supported":      []string{"S256"},
		"token_endpoint_auth_methods_supported": []string{"none"},
		"scopes_supported":                      []string{"mcp"},
	})
}

func (p *oauthProvider) handleResourceMetadata(w http.ResponseWriter, r *http.Request) {
	// The canonical protected-resource URI is the MCP endpoint itself (/sse),
	// not the host root — otherwise the client binds/retries the token against
	// the wrong resource.
	writeJSON(w, http.StatusOK, map[string]any{
		"resource":              p.publicURL + "/mcp",
		"authorization_servers": []string{p.publicURL},
	})
}

// ── dynamic client registration (RFC 7591) ────────────────────────────────────

func (p *oauthProvider) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		cors(w)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "invalid_request"})
		return
	}
	var req map[string]any
	_ = json.NewDecoder(r.Body).Decode(&req)
	log.Printf("[oauth] register redirect_uris=%v client_name=%v", req["redirect_uris"], req["client_name"])

	resp := map[string]any{
		"client_id":                  "mcp-" + randToken(16),
		"token_endpoint_auth_method": "none",
		"grant_types":                []string{"authorization_code"},
		"response_types":             []string{"code"},
	}
	if v, ok := req["redirect_uris"]; ok {
		resp["redirect_uris"] = v
	}
	if v, ok := req["client_name"]; ok {
		resp["client_name"] = v
	}
	writeJSON(w, http.StatusCreated, resp)
}

// ── authorization endpoint ─────────────────────────────────────────────────────

var consentTmpl = template.Must(template.New("consent").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to BizSpark AI</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f1f5f9;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.08);padding:32px;max-width:420px;width:90%}
  h1{font-size:20px;margin:0 0 4px}
  p{color:#64748b;font-size:14px;margin:0 0 20px}
  label{font-size:13px;font-weight:600;color:#334155;display:block;margin-bottom:6px}
  input{width:100%;box-sizing:border-box;padding:12px;border:2px solid #e2e8f0;border-radius:10px;font-size:14px;font-family:monospace}
  button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:#6d28d9;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  .err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:13px;padding:10px;border-radius:8px;margin-bottom:16px}
  .logo{width:44px;height:44px;border-radius:12px;background:#6d28d9;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;margin-bottom:16px}
  .hint{font-size:12px;color:#94a3b8;margin-top:12px}
</style></head>
<body><div class="card">
  <div class="logo">⚡</div>
  <h1>Connect to BizSpark AI</h1>
  <p>Authorize Claude to access your store data.</p>
  {{if .Error}}<div class="err">{{.Error}}</div>{{end}}
  <form method="post" action="/oauth/authorize">
    <label for="api_key">Your AI Connect key</label>
    <input id="api_key" name="api_key" type="password" placeholder="biz_mcp_…" autocomplete="off" autofocus required>
    <input type="hidden" name="redirect_uri" value="{{.RedirectURI}}">
    <input type="hidden" name="state" value="{{.State}}">
    <input type="hidden" name="code_challenge" value="{{.CodeChallenge}}">
    <button type="submit">Authorize</button>
  </form>
  <p class="hint">Get this key from your BizSpark dashboard → AI Connect → Generate.</p>
</div></body></html>`))

type consentData struct {
	Error         string
	RedirectURI   string
	State         string
	CodeChallenge string
}

func (p *oauthProvider) handleAuthorize(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		q := r.URL.Query()
		log.Printf("[oauth] authorize GET query=%s", r.URL.RawQuery)
		redirectURI := q.Get("redirect_uri")
		codeChallenge := q.Get("code_challenge")
		method := q.Get("code_challenge_method")
		if !allowedRedirect(redirectURI) {
			http.Error(w, "invalid redirect_uri", http.StatusBadRequest)
			return
		}
		if codeChallenge == "" || (method != "" && method != "S256") {
			http.Error(w, "PKCE with S256 is required", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = consentTmpl.Execute(w, consentData{
			RedirectURI:   redirectURI,
			State:         q.Get("state"),
			CodeChallenge: codeChallenge,
		})

	case http.MethodPost:
		_ = r.ParseForm()
		apiKey := strings.TrimSpace(r.PostFormValue("api_key"))
		redirectURI := r.PostFormValue("redirect_uri")
		state := r.PostFormValue("state")
		codeChallenge := r.PostFormValue("code_challenge")

		if !allowedRedirect(redirectURI) {
			http.Error(w, "invalid redirect_uri", http.StatusBadRequest)
			return
		}
		if _, err := p.db.ResolveAPIKey(r.Context(), apiKey); err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusUnauthorized)
			_ = consentTmpl.Execute(w, consentData{
				Error:         "That key is invalid or revoked. Check it and try again.",
				RedirectURI:   redirectURI,
				State:         state,
				CodeChallenge: codeChallenge,
			})
			return
		}

		code := randToken(24)
		p.mu.Lock()
		p.codes[code] = authCode{
			apiKey:        apiKey,
			codeChallenge: codeChallenge,
			redirectURI:   redirectURI,
			expiresAt:     time.Now().Add(5 * time.Minute),
		}
		p.mu.Unlock()
		log.Printf("[oauth] authorize OK redirect_uri=%q challenge_len=%d", redirectURI, len(codeChallenge))

		sep := "?"
		if strings.Contains(redirectURI, "?") {
			sep = "&"
		}
		http.Redirect(w, r,
			redirectURI+sep+"code="+url.QueryEscape(code)+"&state="+url.QueryEscape(state),
			http.StatusFound)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// ── token endpoint ─────────────────────────────────────────────────────────────

func (p *oauthProvider) handleToken(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		cors(w)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "invalid_request"})
		return
	}
	_ = r.ParseForm()
	log.Printf("[oauth] token form=%v", r.Form)
	grant := r.PostFormValue("grant_type")
	code := r.PostFormValue("code")
	verifier := r.PostFormValue("code_verifier")
	redirectURI := r.PostFormValue("redirect_uri")
	log.Printf("[oauth] token grant=%q code_len=%d verifier_len=%d redirect_uri=%q ct=%q",
		grant, len(code), len(verifier), redirectURI, r.Header.Get("Content-Type"))

	if grant != "authorization_code" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "unsupported_grant_type"})
		return
	}

	p.mu.Lock()
	ac, ok := p.codes[code]
	if ok {
		delete(p.codes, code) // single use
	}
	p.mu.Unlock()

	if !ok || time.Now().After(ac.expiresAt) {
		log.Printf("[oauth] token FAIL: code unknown/expired (found=%v)", ok)
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_grant", "error_description": "code expired or unknown"})
		return
	}
	// redirect_uri: enforce match only when the client sent one (PKCE is the
	// primary protection; some clients omit it on the token request).
	if redirectURI != "" && ac.redirectURI != redirectURI {
		log.Printf("[oauth] token FAIL: redirect_uri mismatch stored=%q got=%q", ac.redirectURI, redirectURI)
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_grant", "error_description": "redirect_uri mismatch"})
		return
	}
	// PKCE S256 verification
	sum := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(sum[:])
	if computed != ac.codeChallenge {
		log.Printf("[oauth] token FAIL: PKCE mismatch computed=%q stored=%q", computed, ac.codeChallenge)
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_grant", "error_description": "PKCE verification failed"})
		return
	}
	log.Printf("[oauth] token OK — issuing access token")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")

	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": ac.apiKey, // the biz_mcp key — resolved by the SSE auth middleware
		"token_type":   "Bearer",
		"expires_in":   31536000,
		"scope":        "mcp",
	})
}
