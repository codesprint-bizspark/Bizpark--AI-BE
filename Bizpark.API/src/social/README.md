# AI Social Media Agent

Production-quality implementation of an AI-powered social media agent for the BizSpark platform. Generates platform-specific posts (Facebook / Instagram / TikTok) from the user's business + generated website, lets them preview/edit/regenerate, then publishes through official OAuth-authenticated APIs with a BullMQ-backed queue.

This document is the source of truth for how the feature works end-to-end. Read it once and you'll be able to extend, debug, or operate it.

---

## 1 — Architecture map

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Frontend  (Next.js / Tailwind)                                          │
│    /dashboard/social             — connect & manage accounts             │
│    /dashboard/social/generate    — generate posts (AI wizard)            │
│    /dashboard/social/posts/[id]  — preview, edit, publish, schedule      │
│    /dashboard/social/scheduled   — calendar/history                      │
└──────────────────────────────────────────────────────────────────────────┘
                              │  fetch via /lib/social/api.ts
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Bizpark.API  (NestJS — port 3000)                                       │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ social/                                                            │  │
│  │   accounts/      OAuth init → callback → encrypted storage         │  │
│  │   content/       AI generation, editing, regeneration              │  │
│  │   publishing/    publish-now / schedule / cancel + BullMQ worker   │  │
│  │   platforms/     PlatformClient implementations (FB / IG / TT)     │  │
│  │   ai/            OpenAI wrapper + prompt templates                 │  │
│  │   common/        AES-256-GCM token crypto + signed OAuth state     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
       │                                            │
       │ TypeORM                                    │ BullMQ (ioredis)
       ▼                                            ▼
┌─────────────────────────┐                 ┌─────────────────────────┐
│  Postgres (Neon)        │                 │  Redis (Upstash etc.)   │
│   schema: api           │                 │   queue: social-publish │
│                         │                 └─────────────────────────┘
│   SocialAccount         │                            │
│   SocialPost            │                            │  in-process worker
│   SocialPostMedia       │                            │  (SocialPublishingProcessor)
│   AiGeneration          │                            ▼
│   PublishingLog         │                 ┌─────────────────────────┐
└─────────────────────────┘                 │  Meta Graph API         │
                                            │  Instagram Graph API    │
                                            │  TikTok Content Posting │
                                            └─────────────────────────┘
```

The whole agent is **NestJS-native** — no Python runner needed for this feature, because publishing is purely API-driven. The existing Python runner stays focused on website generation.

---

## 2 — Folder structure

### Backend (`Bizpark.API/src/social/`)

```
accounts/
  social-accounts.controller.ts     REST routes: connect, callback, list, disconnect
  social-accounts.service.ts        OAuth glue, token encryption, refresh handling
ai/
  openai.service.ts                 OpenAI SDK wrapper (text + image)
  prompts.ts                        Platform-tailored prompt templates
content/
  social-content.controller.ts      REST routes: generate, list, update, regenerate, media
  social-content.service.ts         Generation orchestration + draft persistence
publishing/
  social-publishing.controller.ts   REST routes: publish-now, schedule, cancel, history, logs
  social-publishing.service.ts      Enqueue jobs + status transitions
  social-publishing.processor.ts    BullMQ worker — runs in-process inside the API
platforms/
  platform-client.types.ts          Shared `PlatformClient` interface
  facebook.client.ts                Meta Pages publishing + OAuth
  instagram.client.ts               IG Graph (Business) — image/carousel/Reels
  tiktok.client.ts                  TikTok Login Kit + Content Posting (PULL_FROM_URL)
  platform-registry.service.ts      `Map<SocialPlatform, PlatformClient>`
common/
  token-crypto.ts                   AES-256-GCM at rest
  oauth-state.ts                    HMAC-signed OAuth `state` (CSRF + expiry)
social.module.ts                    Wires the whole module + BullMQ queue
```

### Core / shared library (`Bizpark.Core/src/`)

```
typeorm/entities/api/
  social-account.entity.ts
  social-post.entity.ts
  social-post-media.entity.ts
  ai-generation.entity.ts
  publishing-log.entity.ts
typeorm/migrations/application/
  1713000000000-CreateSocialMediaAgentTables.ts
common/dtos/social-media.dto.ts     All request DTOs the FE sends
```

### Frontend (`BizSpark-AI---FE/src/`)

```
app/dashboard/social/
  page.tsx                          Accounts page (connect/disconnect)
  sub-nav.tsx                       Tabbed nav for the social feature
  generate/page.tsx                 AI Generate wizard
  posts/page.tsx                    Drafts grid
  posts/[postId]/page.tsx           Preview + editor (social-media-style preview)
  scheduled/page.tsx                Calendar + history
lib/social/
  types.ts                          TS mirror of the backend entities
  api.ts                            Thin fetch wrappers
```

---

## 3 — Database schema (api schema)

| Table              | Purpose                                                                                                |
|--------------------|--------------------------------------------------------------------------------------------------------|
| `SocialAccount`    | One row per (business, platform, externalAccountId). Stores **encrypted** access + refresh tokens.     |
| `SocialPost`       | Drafts / scheduled / published posts. Captions, hashtags, AI metadata, platform, account FK.           |
| `SocialPostMedia`  | Images / videos / thumbnails attached to a post. Position-ordered.                                     |
| `AiGeneration`     | Every AI call (full generation or single-field regenerate) with model, tokens, latency, input/output. |
| `PublishingLog`    | One row per publish attempt; status + retries + error code + external post id.                        |

All tables have `createdAt`, `updatedAt`, soft-delete via `deletedAt`. Indexes cover the most common query paths (`businessId+status`, `scheduledAt`, `postId`).

Migration: `1713000000000-CreateSocialMediaAgentTables.ts` — idempotent (uses `IF NOT EXISTS` everywhere). Run it once after pulling:

```bash
cd Bizpark.Core
npm run migration:run:app
```

---

## 4 — OAuth flow

```
┌────────────┐       ┌─────────────────────┐        ┌─────────────────┐
│  Browser   │       │  Bizpark.API        │        │  Meta / TikTok  │
└─────┬──────┘       └──────────┬──────────┘        └─────────┬───────┘
      │ POST /api/social/accounts/connect              │
      │  (businessId, platform, redirectAfterConnect)  │
      │ ────────────────────────►                      │
      │                                                │
      │ ◄────────────────────── { authorizationUrl }   │
      │                                                │
      │  window.location = authorizationUrl            │
      │ ─────────────────────────────────────────────► │
      │                                                │
      │                ◄ redirects with ?code=…&state=…│
      │ GET /api/social/accounts/callback?code=…       │
      │ ────────────────────────►                      │
      │       (1) verify HMAC state, parse businessId  │
      │       (2) exchange code → long-lived token     │
      │       (3) AES-GCM encrypt access + refresh     │
      │       (4) upsert SocialAccount row             │
      │ ◄──────────── 302 → FE /dashboard/social?…     │
```

- **No usernames/passwords** ever transit through us.
- The `state` parameter is HMAC-signed with `OAUTH_STATE_SECRET` (or falls back to `JWT_SECRET`) and includes a 10-minute expiry + 12-byte nonce. CSRF is impossible without leaking the secret.
- Tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) before going to the DB. Decryption only happens server-side inside `SocialAccountsService.getAccountForPublishing`. **The FE never sees a token.**

### Token refresh

`SocialAccountsService.getAccountForPublishing` is the single choke-point. When called:

1. Loads the account, decrypts the access token.
2. If `tokenExpiresAt` is within 60s, attempts `PlatformClient.refreshAccessToken(refreshToken)`.
3. On success, persists the new tokens (encrypted) and continues.
4. On failure, marks the account `EXPIRED` so the UI surfaces a **Reconnect** button.

Facebook + Instagram page tokens don't expire (when derived from a long-lived user token), so `refreshAccessToken` is a no-op for those platforms — we explicitly throw a "reconnect required" error if the platform later rejects the token. TikTok tokens last 24 hours and ship with a 365-day refresh token.

---

## 5 — Publishing workflow

```
publish-now  ─┐
             ├─► SocialPublishingService.publishNow
schedule  ───┘     │
                   │   set post.status = PUBLISHING (or SCHEDULED + delay)
                   ▼
            BullMQ queue: `social-publish`
                   │
                   ▼
         SocialPublishingProcessor.process
                   │
                   │   1. Open PublishingLog row (PENDING)
                   │   2. accountsService.getAccountForPublishing(...)
                   │   3. PlatformClient.publish(...)
                   │   4. On success → post.status = PUBLISHED, log.status = SUCCESS
                   │   5. On error   → log.status = RETRYING/FAILED, throw → BullMQ retries
                   │   6. Final fail → onFailed hook marks post.status = FAILED
                   ▼
            Meta / IG / TikTok APIs
```

Retry policy: 4 attempts with exponential backoff (5s, 10s, 20s, 40s). Jobs are kept for 7 days for traceability.

Each publish attempt is a row in `PublishingLog` with `attempt`, `externalPostId`, raw response, and any error code/message. The "publishing history" page reads from `SocialPost` (the canonical source) and the post-detail page can drill into the per-attempt logs via `GET /api/social/publishing/:businessId/posts/:postId/logs`.

### Auth-error detection

If the platform error message matches `/token|auth|expired|permission/i`, the processor automatically marks the account `EXPIRED`. The UI then shows the "Reconnect" badge on that platform card.

---

## 6 — AI generation

`POST /api/social/content/generate` orchestrates the full pipeline:

1. Load the business + its latest website CMS data.
2. Build a **single** OpenAI prompt that asks for platform-tailored variants in one round trip (saves tokens vs N prompts).
3. Parse the JSON response.
4. Persist one `AiGeneration` row + N `SocialPost` rows (one per platform).
5. If `generateMedia=true` and postType ∈ {IMAGE, FLYER}, call OpenAI Images and attach the result as `SocialPostMedia` with `source = AI_GENERATED`.

Single-field regeneration goes through `POST /api/social/content/:businessId/posts/:postId/regenerate` with `{ field, instructions? }`. Each regeneration appends a new `AiGeneration` row so the user has a full **regeneration history** (audit + analytics).

### Prompt templates

Templates live in `social/ai/prompts.ts`. They encode platform-specific best-practice:

- **Facebook** — long-form (~600–900 chars), 3–6 hashtags.
- **Instagram** — punchy hook + 8–15 niche hashtags + visual-first.
- **TikTok** — short hook caption (<150 chars), trending hashtags, +scene script.

Per post type:
- TEXT — caption + CTA + hashtags only
- IMAGE — adds `imagePrompt`
- FLYER — adds `flyerPrompt`
- VIDEO — adds `videoConcept` + 3–5 scene `videoScript`

---

## 7 — REST API

All endpoints below are JSON. JWT bearer required except `/callback`.

### Accounts
```
GET     /api/social/accounts/:businessId
POST    /api/social/accounts/connect            { businessId, platform, redirectAfterConnect? }
GET     /api/social/accounts/callback           (public, returns 302 redirect)
DELETE  /api/social/accounts/:businessId/:accountId
```

### Content
```
POST    /api/social/content/generate                              { businessId, platforms[], postType, topic?, tone?, audience?, hashtagLimit?, generateMedia? }
GET     /api/social/content/:businessId/posts                     ?status&platform&take
GET     /api/social/content/:businessId/posts/:postId
PATCH   /api/social/content/:businessId/posts/:postId             { caption?, cta?, hashtags?, scheduledAt?, platform?, postType?, accountId?, aiMetadata? }
POST    /api/social/content/:businessId/posts/:postId/regenerate  { field, instructions? }
POST    /api/social/content/:businessId/posts/:postId/media       { url, kind, mimeType?, ... }
POST    /api/social/content/:businessId/posts/:postId/media/ai-image  { prompt? }
DELETE  /api/social/content/:businessId/posts/:postId/media/:mediaId
DELETE  /api/social/content/:businessId/posts/:postId
```

### Publishing
```
POST    /api/social/publishing/:businessId/posts/:postId/publish-now       { accountId? }
POST    /api/social/publishing/:businessId/posts/:postId/schedule          { scheduledAt }
POST    /api/social/publishing/:businessId/posts/:postId/cancel-scheduled
GET     /api/social/publishing/:businessId/scheduled
GET     /api/social/publishing/:businessId/history?take=50
GET     /api/social/publishing/:businessId/posts/:postId/logs
```

### Example responses

**`POST /api/social/content/generate`**
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "id": "1c8…",
        "platform": "INSTAGRAM",
        "postType": "IMAGE",
        "status": "DRAFT",
        "caption": "Tuesday calls for a flat white ☕…",
        "cta": "Tap to order",
        "hashtags": ["coffeelover", "thirdwavecoffee", "kopi"],
        "aiMetadata": { "imagePrompt": "A minimalist top-down shot of a flat white on a marble counter, soft natural light, ceramic cup, foam latte art …" },
        "accountId": "f93…",
        "media": [{ "id": "m1", "url": "data:image/png;base64,…", "kind": "IMAGE", "source": "AI_GENERATED" }]
      },
      { "id": "1c9…", "platform": "FACEBOOK", "...": "..." }
    ],
    "generationId": "ai-gen-uuid"
  }
}
```

**`POST /api/social/publishing/:bid/posts/:pid/publish-now`**
```json
{ "success": true, "data": { "queued": true, "postId": "1c8…" } }
```

---

## 8 — Environment variables

```bash
# Existing
DATABASE_URL=postgres://…
APPLICATION_DATABASE_URL=…
JWT_SECRET=…
REDIS_URL=rediss://…              # or REDIS_HOST / REDIS_PORT

# NEW — Security
TOKEN_ENCRYPTION_KEY=<32+ random bytes — MUST be set in prod>
OAUTH_STATE_SECRET=<random>        # optional; falls back to JWT_SECRET

# NEW — OpenAI
OPENAI_API_KEY=sk-…
OPENAI_TEXT_MODEL=gpt-4o-mini      # optional override
OPENAI_IMAGE_MODEL=gpt-image-1     # optional override

# NEW — Frontend redirect
FRONTEND_URL=https://app.bizpark.app

# NEW — Facebook / Instagram
FACEBOOK_APP_ID=…
FACEBOOK_APP_SECRET=…
FACEBOOK_REDIRECT_URI=https://api.bizpark.app/api/social/accounts/callback
INSTAGRAM_APP_ID=…                 # often == FACEBOOK_APP_ID
INSTAGRAM_APP_SECRET=…             # often == FACEBOOK_APP_SECRET
INSTAGRAM_REDIRECT_URI=https://api.bizpark.app/api/social/accounts/callback

# NEW — TikTok
TIKTOK_CLIENT_KEY=…
TIKTOK_CLIENT_SECRET=…
TIKTOK_REDIRECT_URI=https://api.bizpark.app/api/social/accounts/callback
TIKTOK_DEFAULT_PRIVACY=SELF_ONLY   # or PUBLIC_TO_EVERYONE after app review
```

The `callback` route is **the same URL** for all three platforms — it disambiguates via the signed `state` parameter (which carries `platform`). This keeps the OAuth app configuration simple.

---

## 9 — Security checklist

| Concern                     | How it's handled                                                                  |
|-----------------------------|-----------------------------------------------------------------------------------|
| Token at rest               | AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY` (SHA-256-derived 32 bytes)           |
| Token to frontend           | **Never** — `SocialAccountsService.toSafeView` strips the cipher fields           |
| OAuth CSRF                  | HMAC-signed `state` + 10-min TTL + 12-byte nonce                                  |
| OAuth callback              | Public by design; no JWT — trust comes from the signed state                      |
| Cross-business leakage      | Every controller verifies `post.businessId === param.businessId`                  |
| Publishing logic in FE      | Zero — all publish/refresh/decrypt happens in the API                             |
| Account hijack on disconnect| `softDelete` flips status + sets `deletedAt`; future publishes will refuse        |
| OpenAI prompt injection     | Untrusted user fields (topic/audience) are passed as free text; outputs are JSON-validated; no shell/exec   |
| Replay attacks              | OAuth `state` carries `exp` (10 min); BullMQ `jobId = scheduled:<postId>` prevents dup-schedule       |
| Long-lived tokens           | Auto-refresh inside `getAccountForPublishing`; `EXPIRED` status triggers UI reconnect |

For production hardening, also recommended:
- Mount the API behind a reverse proxy that enforces HTTPS + HSTS.
- Rotate `TOKEN_ENCRYPTION_KEY` annually via a `version` byte (already encoded in the wire format — bump from `0x01` to `0x02` and keep dual-decrypt support during the rotation window).
- Pin the OpenAI model in environment so accidental upgrades don't change prompt behavior.
- Add rate limits on `/api/social/content/generate` (OpenAI cost) and `/api/social/accounts/connect` (anti-abuse).

---

## 10 — User flow (end-to-end)

1. **Create business** → website is auto-generated (existing flow).
2. Go to **Dashboard → Social Media**.
3. Click **Connect Account** on a platform card → redirected to FB/IG/TikTok OAuth.
4. Grant permissions → bounced back to `/dashboard/social?connect_status=success`.
5. Click **Generate Posts** → pick platforms / post type / tone / topic.
6. Backend reads website + business → calls OpenAI → drafts one `SocialPost` per platform.
7. User lands on the post-detail screen with a **social-media-style preview** + an editor.
8. User can: edit caption/CTA/hashtags inline · regenerate any single field · attach a custom image/video URL · generate a fresh AI image · pick account · schedule or publish now.
9. **Schedule** → BullMQ job queued with `delay`. **Publish Now** → status flips to `PUBLISHING`, job runs immediately.
10. Worker picks up → calls platform client → on success, post → `PUBLISHED` with `externalPostId` + `externalPostUrl`.
11. **Scheduled** tab shows upcoming posts grouped by day + a published history list.

The system **never** auto-publishes — every post goes through `DRAFT → (PUBLISHING or SCHEDULED) → PUBLISHED|FAILED`, and the user always confirms.

---

## 11 — Extending to a new platform

Adding LinkedIn / X / YouTube Shorts / Pinterest is a 4-file change:

1. Add a new value to `SocialPlatform` enum in `Bizpark.Core/src/typeorm/entities/shared/enums.ts` (and a migration to extend the Postgres enum).
2. Implement `LinkedInClient implements PlatformClient` in `social/platforms/linkedin.client.ts` — `getAuthorizationUrl`, `exchangeCode`, `refreshAccessToken`, `disconnect`, `publish`.
3. Inject + register it in `PlatformRegistry`.
4. Add a tile to `app/dashboard/social/page.tsx`.

No changes to the queue, the publisher, the AI prompts, or the schema. The platform abstraction is the whole point of the registry.

---

## 12 — Deployment notes

- **Redis is required** even in single-instance deploys — BullMQ workers run in-process inside the API container, but the queue itself is in Redis. Upstash / Railway Redis both work; set `REDIS_URL`.
- **Worker concurrency** defaults to 1 per Nest instance. Scale horizontally by adding API replicas; BullMQ handles distribution.
- **Cold starts** — the publishing processor starts on Nest boot. No separate runner deploy.
- **OpenAI cost** — text models are tiny (~$0.001 per generation). Image generation with `gpt-image-1` is the dominant cost. Default the FE to ask before generating images on regeneration.
- **Database** — the migration is additive and idempotent. Existing data is not touched.

---

## 13 — Local dev quick-start

```bash
# 1. Install (already done if you've run the project once)
cd Bizpark--AI-BE
npm --prefix Bizpark.Core install
npm --prefix Bizpark.API install
npm --prefix BizSpark-AI---FE install

# 2. Run the migration
cd Bizpark.Core
npm run migration:run:app

# 3. Required env (in Bizpark.Core/.env)
echo 'OPENAI_API_KEY=sk-...'                       >> .env
echo 'TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)' >> .env
echo 'FACEBOOK_APP_ID=...'                          >> .env
echo 'FACEBOOK_APP_SECRET=...'                      >> .env
echo 'FACEBOOK_REDIRECT_URI=http://localhost:3000/api/social/accounts/callback' >> .env
# repeat for INSTAGRAM_* and TIKTOK_*

# 4. Start
cd ../Bizpark.API
npm run start:dev          # nest API on :3000
cd ../../BizSpark-AI---FE
npm run dev                # next FE on :9002
```

Smoke-test:
```bash
# Get a JWT from the existing /api/auth/login first
curl -X POST localhost:3000/api/social/accounts/connect \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{ "businessId": "<your-biz-id>", "platform": "FACEBOOK" }'
```

You should get back `{ data: { authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth?..." } }`. Open that URL in a browser, complete OAuth, and you'll be bounced back to `/dashboard/social?connect_status=success`.
