# Bizpark--AI-BE

## Architecture

```
┌──────────────┐     ┌──────────┐     ┌──────────────────┐
│  Bizpark.API │────▶│  Redis   │◀────│ Bizpark.Runner.Py│
│  (NestJS)    │     │  (Queue) │     │  (FastAPI)       │
│  Port 3000   │     └──────────┘     │  Port 3001       │
└──────┬───────┘                      └────────┬─────────┘
       │         ┌──────────────┐              │
       │         │ Bizpark.Admin│              │
       │         │ (NestJS)     │              │
       │         │ Port 3002    │              │
       │         └──────┬───────┘              │
       │                │                      │
       ▼                ▼                      ▼
┌─────────────────────────────────────────────────┐
│              PostgreSQL (Neon)                   │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐        │
│  │ api     │  │ admin   │  │ runner   │ schemas │
│  └─────────┘  └─────────┘  └──────────┘        │
└─────────────────────────────────────────────────┘
```

## Ecommerce Architecture (Commerce + Frontend)

```
                              CLIENTS
┌────────────────────────────────┐   ┌────────────────────────────────┐
│      Bizpark.Commerce.Web       │   │        Bizpark.Mobile           │
│        Next.js · :3004          │   │     React Native + Expo         │
│   tenant storefront (web)       │   │   per-tenant customer app       │
│   ?tenant= / subdomain          │   │   config via /mobile-app-config │
│                                 │   │   OTA updates via EAS           │
└───────────────┬─────────────────┘   └────────────────┬───────────────┘
                │ HTTP + x-tenant-id                    │ HTTPS + tenant id
                └──────────────────┬────────────────────┘
                                   ▼
                                 BACKEND
┌─────────────────────────────────────────┐
│           Bizpark.Commerce              │
│           NestJS · Port 3003            │
│  Auth · Catalog · Cart · Checkout       │
│  Orders · Inventory · Payments          │
│  + /website-config  + /mobile-app-config│
└──────────────────┬──────────────────────┘
                   │
                  DATABASE
┌─────────────────────────────────────────┐
│       Neon PostgreSQL (Commerce)        │
│  ├── tenant_business_a  (isolated)      │
│  ├── tenant_business_b  (isolated)      │
│  └── tenant_...                         │
└─────────────────────────────────────────┘
        ▲ read-only (products, orders, customers)
        │
┌───────┴───────────┐      Claude Desktop / Claude.ai (web)
│  Bizpark.MCP (Go) │◀──── MCP · OAuth / API key ─── 🤖 external AI client
│   AI Connect :3005│
└───────────────────┘
```

> **AI Connect:** the MCP server is an *inbound* gateway — an external AI assistant (Claude) connects **in** to read a merchant's store data. It's distinct from the *outbound* External Integrations (where the platform calls out to OpenAI/Meta/Google). See [AI Connect (MCP)](#ai-connect-mcp--bizparkmcp).

> **Bizpark.Mobile (React Native + Expo):** one app, **config-driven per tenant** — it fetches branding/products from `GET /mobile-app-config` (Commerce) using the business's tenant id, so the same binary serves every store. Distributed via **EAS** (`eas build` for the APK, `eas update` for OTA pushes — no rebuild). Customers reach it from the dashboard's **Mobile App** page: the QR encodes `https://<dashboard>/m?tenant=<id>`, and that public `/m` bounce page deep-links into the installed app (`bizpark://?tenant=<id>`) or falls back to the install link.

| Package | Description | Port | Tech |
|---|---|---|---|
| **Bizpark.Core** | Shared library (entities, DTOs, DB config) | — | TypeScript |
| **Bizpark.API** | REST API (auth, business, website, agents, **social**, **billing**) | 3000 | NestJS |
| **Bizpark.Runner.Py** | BullMQ worker (AI agent task processor + AI image gen) | 3001 | FastAPI |
| **Bizpark.Admin** | Admin API (template + mobile-app store-request management) | 3002 | NestJS |
| **Bizpark.Commerce** | Multi-tenant ecommerce backend (per-business store) | 3003 | NestJS |
| **Bizpark.Commerce.Web** | Tenant storefront — connects to Commerce, config-driven | 3004 | Next.js |
| **Bizpark.MCP** ⭐ | AI Connect — MCP server exposing tenant store data to Claude | 3005 | Go |
| **Bizpark.Mobile** ⭐ | Customer mobile app (per-tenant), OTA via EAS | — | Expo / React Native |

> The merchant **SaaS dashboard** lives in a separate repo, [`BizSpark-AI---FE`](https://github.com/codesprint-bizspark/BizSpark-AI---FE).

> **Per-tenant storefront subdomains:** a merchant claims a custom address in the dashboard (e.g. `olybella.bizspark.online`). The API validates/stores the slug (`businesses.slug`); a DNS-only wildcard `*.bizspark.online` + a Let's Encrypt wildcard cert mean **no per-record DNS is created** — the subdomain resolves instantly. `Bizpark.Commerce.Web` middleware resolves `<slug>` → tenant id via the public `GET /api/storefront/resolve/:slug` endpoint, then renders that tenant's store. The shared `store.bizspark.online/?tenant=<id>` host still works as a fallback.

## Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL ([Neon](https://neon.tech) recommended)
- Redis (Docker / [Upstash](https://upstash.com) / Memurai)

## Quick Start

### 1. First-time setup (run once)

```bash
# Copy and configure env
cp Bizpark.Core/.env.example Bizpark.Core/.env
# Edit .env — set DATABASE_URL, REDIS_HOST, REDIS_PORT

# Install, bootstrap DB, run migrations, build
cd Bizpark.Core
npm install
npm run db:bootstrap
npm run migration:run:app
npm run migration:run:admin
npm run migration:run:runner
npm run build
```

See [`FIRST_TIME_SETUP.md`](./FIRST_TIME_SETUP.md) for details.

### 2. Start Redis

```bash
docker run -d --name bizpark-redis -p 6379:6379 redis:7
```

### 3. Setup Runner (one time)

```bash
cd Bizpark.Runner.Py
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

### 4. Run services (separate terminals)

```bash
# Terminal 1 — API
cd Bizpark.API
npm install
npm run start:dev

# Terminal 2 — Runner (FastAPI)
cd Bizpark.Runner.Py
venv\Scripts\activate
python run.py

# Terminal 3 — Admin
cd Bizpark.Admin
npm install
npm run start:dev

# Terminal 4 — Commerce backend
cd Bizpark.Commerce
npm install
npm run start:dev

# Terminal 5 — Frontend storefront
cd Bizpark.Frontend
npm install
npm run dev
```

## API Endpoints

### Auth — `/api/auth`
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |

### Business — `/api/business`
| Method | Route | Description |
|---|---|---|
| POST | `/api/business` | Create business |
| GET | `/api/business` | List businesses |
| GET | `/api/business/:id` | Get business |
| POST | `/api/business/:id/website` | Save website config |
| POST | `/api/business/:id/website/deploy` | Deploy website |

### Agents — `/api/agents`
| Method | Route | Description |
|---|---|---|
| POST | `/api/agents/tasks` | Create agent task |
| GET | `/api/agents/tasks` | List tasks |
| GET | `/api/agents/tasks/:taskId` | Get task status |

### Templates — `/api/templates`
| Method | Route | Description |
|---|---|---|
| POST | `/api/templates` | Create template |
| GET | `/api/templates` | List templates |
| GET | `/api/templates/type/:type` | Get by type |
| GET | `/api/templates/:id` | Get by ID |

## Scripts

### Bizpark.Core
| Script | Description |
|---|---|
| `npm run build` | Compile shared library |
| `npm run db:bootstrap` | Create schemas + tables + enums |
| `npm run migration:run:app` | Run API migrations |
| `npm run migration:run:admin` | Run Admin migrations |
| `npm run migration:run:runner` | Run Runner migrations |
| `npm run migration:revert:app` | Revert last API migration |
| `npm run migration:revert:admin` | Revert last Admin migration |
| `npm run migration:revert:runner` | Revert last Runner migration |

### Bizpark.API / Admin (NestJS)
| Script | Description |
|---|---|
| `npm run start:dev` | Dev mode with hot reload |
| `npm run start:debug` | Debug mode |
| `npm run build` | Production build |
| `npm run test` | Unit tests |
| `npm run test:e2e` | E2E tests |
| `npm run lint` | Lint + auto-fix |

### Bizpark.Runner.Py (FastAPI)
| Command | Description |
|---|---|
| `python run.py` | Start runner (dev with hot reload) |
| `pip install -r requirements.txt` | Install dependencies |

## Environment Variables

All services share [`Bizpark.Core/.env`](./Bizpark.Core/.env.example)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APPLICATION_DATABASE_URL` | API service DB connection |
| `ADMIN_DATABASE_URL` | Admin service DB connection |
| `RUNNER_DATABASE_URL` | Runner service DB connection |
| `APPLICATION_DB_SCHEMA` | API schema name (`api`) |
| `ADMIN_DB_SCHEMA` | Admin schema name (`admin`) |
| `RUNNER_DB_SCHEMA` | Runner schema name (`runner`) |
| `REDIS_HOST` | Redis host (`localhost`) |
| `REDIS_PORT` | Redis port (`6379`) |
| `COMMERCE_DATABASE_URL` | Commerce DB (separate Neon project; tenant schemas) |
| `JWT_SECRET` / `INTERNAL_API_KEY` | auth + internal service auth |
| `OPENAI_API_KEY` | OpenAI (LLM + `gpt-image-1` image fallback) |
| `GEMINI_API_KEY` | Gemini — **primary** LLM for the agents |
| `MINIMAX_API_KEY` | MiniMax — fallback LLM **and primary image generation** (`image-01`) |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `FACEBOOK_REDIRECT_URI` / `FACEBOOK_SCOPES` | Facebook page publishing (Meta app) |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / `INSTAGRAM_REDIRECT_URI` / `INSTAGRAM_SCOPES` | Instagram publishing — **use the *Instagram* app id/secret** from "API setup with Instagram login", not the Facebook App ID |
| `TOKEN_ENCRYPTION_KEY` / `OAUTH_STATE_SECRET` | encrypt stored OAuth tokens; sign OAuth state |
| `PAYHERE_MERCHANT_ID` / `PAYHERE_MERCHANT_SECRET` / `PAYHERE_SANDBOX` | subscription billing (PayHere) |
| `PUBLIC_API_URL` | public HTTPS base — PayHere `notify_url` + Instagram media fetch |
| `FRONTEND_URL` / `COMMERCE_WEB_URL` | OAuth redirects + storefront links |
| `MCP_PORT` / `MCP_PUBLIC_URL` | MCP server port (3005) + public base for AI Connect |

## AI Connect (MCP) — `Bizpark.MCP`

A standalone **Go** server that lets a merchant plug **their** store data into Claude (Desktop or Claude.ai web) over the Model Context Protocol. It reads the Commerce DB tenant schemas (products, orders, customers, revenue — read-only) and is multi-tenant isolated by per-business API keys (`McpApiKey`, auto-created in the Commerce DB).

- **Claude Desktop:** HTTP+SSE transport — `mcp-remote https://admin.bizspark.online/sse` + `Authorization: Bearer <biz_mcp_key>`.
- **Claude.ai web:** Streamable HTTP transport at `/mcp` + OAuth 2.0/PKCE (with a `?key=` fallback). Keys are generated in the dashboard → **AI Connect**.

```bash
cd Bizpark.MCP && go run .   # needs COMMERCE_DATABASE_URL; serves :3005 (or MCP_PORT)
```

## Deployment

Containerised and shipped via GitOps. Each service has a `Dockerfile.*` at the repo root; CI (`.github/workflows/build-publish-ghcr-update-infra.yml`) builds **7 images** on push to `main`, publishes to `ghcr.io/codesprint-bizspark/*`, and pins their digests in the [`Infra`](https://github.com/codesprint-bizspark/Infra) repo's prod overlay (ArgoCD then rolls them out to K3s).

| Dockerfile | Image |
|---|---|
| `Dockerfile.api` | `bizpark-api` |
| `Dockerfile.admin` | `bizpark-admin` |
| `Dockerfile.commerce` | `bizpark-commerce` |
| `Dockerfile.commerce-web` | `bizpark-commerce-web` |
| `Dockerfile.runner` | `bizpark-runner` |
| `Dockerfile.mcp` | `bizpark-mcp` |

> Runtime config is delivered as a Bitnami **SealedSecret** (`bizpark-runtime-env`) — see the `Infra` repo. `Bizpark.Mobile` ships via **EAS** (`eas build` / `eas update`), not Docker.

## Database Schema

```
Neon PostgreSQL (Main)              Neon PostgreSQL (Commerce — separate project)
├── api      → User, Business       ├── tenant_<businessId>  → products, orders,
├── admin    → Template             │   customers, cart, inventory, config ...
└── runner   → AgentTask            └── tenant_<businessId2> → isolated per business
```

> Commerce uses a **separate Neon project**. Each business gets its own schema auto-created on first request. See [`Bizpark.Commerce/README.md`](./Bizpark.Commerce/README.md).
