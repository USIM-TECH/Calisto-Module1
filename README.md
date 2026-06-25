# Calisto Module 1

## Architecture

```
User message (WhatsApp / Instagram / Messenger / Telegram / X / Webchat)
        │
        ▼
chatbot-integrations (Node/TS API, :3000)
        │
        ├── 0. Context Expansion (Redis session memory)  [resolves "that", "this", "it"]
        │      • Simple references (that, this, it) → expands using session context
        │      • Product modifications (blue ones, cheaper ones) → adds to context
        │      • Accessories (lenses for that) → expands with product context
        │
        ├── 1. Rasa /model/parse  (primary classifier)
        │      • intent.name != nlu_fallback AND confidence ≥ 0.40
        │        → forward raw text to /webhooks/rest/webhook
        │
        ├── 2. LLM fallback (Llama 3 via Ollama, :11434)   [only if Rasa unsure]
        │      • classify intent + entities
        │      • confidence ≥ 0.35 → send /intent{...} payload to Rasa
        │      • confidence  < 0.35 → forward raw text, let Rasa default-fallback fire
        │
        ▼
Rasa core (:5005)  ── runs deterministic rules / forms / actions
        ▼
Rasa action server (:5055)
        ▼
Reply forwarded to the originating channel verbatim

Admin UI (React, :5173)
        │
        ▼
chatbot-frontend  ── calls chatbot-integrations JSON APIs
        (products, knowledge, leads, webchat playground)
```

The LLM layer lives in `chatbot-integrations/src/core/utils/llm-client.ts` and
is toggled with `LLM_LAYER_ENABLED=true|false` in `chatbot-integrations/.env`.
Thresholds: `RASA_NLU_CONFIDENCE_FLOOR` (default `0.4`, matches Rasa's
`FallbackClassifier`) and `LLM_CONFIDENCE_FLOOR` (default `0.35`).

The Context Expansion layer lives in `chatbot-integrations/src/core/context/` and
automatically activates when Redis is enabled. It resolves contextual references
("that", "this", "it") without LLM invocation. See [CONTEXT_EXPANSION.md](chatbot-integrations/CONTEXT_EXPANSION.md).

## Repository layout

| Path | Role |
|------|------|
| [`calisto_nlp_export/`](calisto_nlp_export/) | Rasa NLU, rules, stories, domain, custom actions |
| [`chatbot-integrations/`](chatbot-integrations/) | Channel webhooks, lead orchestration, REST API, Postgres via Prisma |
| [`chatbot-frontend/`](chatbot-frontend/) | React + Vite + Tailwind admin UI (replaces legacy server-rendered dashboards) |

## Quick Start

### 0. Start Ollama + pull Llama 3 (one-time, only if LLM fallback is enabled)

```bash
# Install from https://ollama.com if you haven't
ollama serve &            # usually already running as a systemd/user service
ollama pull llama3
ollama list               # verify llama3 appears
```

The integration service expects Ollama at `http://localhost:11434`
(`OLLAMA_URL` / `OLLAMA_MODEL` in `chatbot-integrations/.env`).

### 1. Start the NLP service

```bash
cd calisto_nlp_export
docker compose down
rm -f models/*.tar.gz
docker compose build --no-cache rasa
mkdir -p models
docker compose run --rm rasa train
docker compose up -d --build
```

Rasa endpoints:
- `http://localhost:5005`
- `http://localhost:5055`

Health/status endpoints:
- `GET /status` (JSON)
- `GET /version` (JSON)

### 2. Start the integration service (backend API)

```bash
cd chatbot-integrations
npm install
cp .env.example .env
# Edit .env: DATABASE_URL, channel tokens, RASA_URL=http://localhost:5005
npm run db:migrate
npm run dev
```

Set `STORAGE_BACKEND=postgres` and `DATABASE_URL` in `.env`. The database is **self-hosted PostgreSQL** — Prisma is only the ORM/migration tool, not the database server.

**Local dev (Docker Postgres):**

```bash
docker compose -f docker-compose.postgres.yml up -d
./scripts/setup-local-postgres.sh
```

`.env`:

```env
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://calisto:calisto@localhost:5432/calisto_chatbot
REDIS_URL=redis://localhost:6379
```

Browse tables with `npm run db:studio`. Caching is documented in [chatbot-integrations/CACHING.md](chatbot-integrations/CACHING.md). Database setup: [chatbot-integrations/prisma/README.md](chatbot-integrations/prisma/README.md).


For JSON-only storage (no Postgres), set `STORAGE_BACKEND=file`. See [chatbot-integrations/LEADS.md](chatbot-integrations/LEADS.md) and [chatbot-integrations/prisma/README.md](chatbot-integrations/prisma/README.md).

Backend API endpoints (used by channels and the React frontend):
- `http://localhost:3000/` — service info
- `http://localhost:3000/health`
- `http://localhost:3000/webhooks/whatsapp`
- `http://localhost:3000/webhooks/instagram`
- `http://localhost:3000/webhooks/messenger`
- `http://localhost:3000/webhooks/telegram`
- `http://localhost:3000/webhooks/x`
- `http://localhost:3000/webchat/message` — website chat API
- `http://localhost:3000/reports/leads` — leads JSON
- `http://localhost:3000/reports/leads/:customerId` — lead detail JSON
- `http://localhost:3000/admin/products/api/*` — product CRUD + CSV import
- `http://localhost:3000/admin/knowledge/api/*` — knowledge document CRUD
- `http://localhost:3000/products/search` — product search (also used by Rasa actions)
- `http://localhost:3000/knowledge/chunks` — knowledge chunks (also used by Rasa actions)

### 3. Start the frontend (React admin UI)

The admin UI is a separate Vite app in `chatbot-frontend/`. It talks to the backend over HTTP — start the integration service first.

```bash
cd chatbot-frontend
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**

Set the backend URL in `chatbot-frontend/.env`. For local dev, leave it empty so Vite proxies API calls to `http://localhost:3000`:

```env
# Recommended for npm run dev (uses Vite proxy)
VITE_API_BASE_URL=

# Or point directly at the backend (production / preview without proxy)
# VITE_API_BASE_URL=http://localhost:3000
```

**Stack:** React 18, TypeScript, Vite, Tailwind CSS, react-router-dom

**Pages:**

| Route | Purpose |
|-------|---------|
| `/leads` | Lead list and summary |
| `/leads/:customerId` | Lead detail, transcript, interests |
| `/products` | Product catalogue admin + CSV import |
| `/knowledge` | Knowledge base document admin |
| `/webchat` | Webchat playground (calls `/webchat/message`) |
| `/chatbot` | Standalone customer-facing chat widget (full-screen, no sidebar) |

Production build:

```bash
cd chatbot-frontend
npm run build
npm run preview   # serves dist/ on :4173 by default
```

See also [chatbot-frontend/README.md](chatbot-frontend/README.md).

### 4. Telegram

See the full end-to-end Telegram runbook: [chatbot-integrations/scripts/TELEGRAM.md](chatbot-integrations/scripts/TELEGRAM.md)

### 5. Cloudflare tunnel (webhooks in dev)

Expose the **backend** for Meta/Telegram webhooks:

```bash
cloudflared tunnel --url http://localhost:3000
```

For WhatsApp and Messenger, update webhook URLs after each tunnel restart:

```bash
cd chatbot-integrations
./scripts/set-meta-webhooks.sh
```

Instagram callback URLs must be set in the Meta App Dashboard (Instagram → API setup → Webhooks).

## Typical dev workflow

### Option A: Fully Docker-based (recommended for production-like setup)

Run these in separate terminals:

```bash
# Terminal 1 — PostgreSQL + Redis (local Docker)
cd chatbot-integrations && docker compose -f docker-compose.postgres.yml up -d

# Terminal 2 — Rasa + actions
cd calisto_nlp_export && docker compose up -d

# Terminal 3 — backend API
cd chatbot-integrations && npm run dev

# Terminal 4 — React admin UI
cd chatbot-frontend && npm run dev

# Terminal 5 — tunnel (when testing channel webhooks)
cloudflared tunnel --url http://localhost:3000
```

Then open **http://localhost:5173** for the admin UI.

### Option B: Hybrid local setup (databases in Docker, services local)

Use this if you're developing Rasa models locally or prefer local Python debugging:

```bash
# Terminal 1 — Start PostgreSQL + Redis in Docker
cd Calisto-Module1
docker compose -f docker-compose.services.yml up -d

# Terminal 2 — Train and run Rasa locally
cd calisto_nlp_export
source .venv/bin/activate  # Activate Python virtual environment
rasa train                  # Train model (first time or after changes)
rasa run --enable-api --cors "*" --port 5005

# Terminal 3 — Run Rasa action server locally
cd calisto_nlp_export
source .venv/bin/activate
rasa run actions --port 5055

# Terminal 4 — Backend API
cd chatbot-integrations
npm run dev

# Terminal 5 — React admin UI
cd chatbot-frontend
npm run dev

# Terminal 6 — Tunnel (when testing channel webhooks)
cloudflared tunnel --url http://localhost:3000
```

**Local Rasa setup requirements:**
- Python virtual environment at `calisto_nlp_export/.venv`
- Rasa 3.6.21 and dependencies installed
- Redis Python client (4.6.0) installed
- Trained model in `calisto_nlp_export/models/`

**Note:** Redis tracker store is available but currently disabled in `endpoints.yml` due to a Rasa 3.6 local compatibility issue. It works fine in Docker mode.

Then open **http://localhost:5173** for the admin UI.
