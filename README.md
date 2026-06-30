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

### Recommended: one command (daily dev)

After first-time `.env` setup (see below), start everything from `chatbot-integrations/`:

```bash
cd chatbot-integrations
cp .env.example .env   # first time only — edit tokens, DATABASE_URL, etc.
./scripts/start-all.sh
```

`start-all.sh` starts MySQL + Redis, runs database migrations, Rasa, Cloudflare tunnel, backend, frontend, and registers Meta/Telegram webhooks when configured.

**First-time database only** (new machine, optional presets):

```bash
cd chatbot-integrations
./scripts/setup-database.sh --seed-presets   # or: npm run db:setup -- --seed-presets
```

For step-by-step manual startup, see [Typical dev workflow](#typical-dev-workflow) below.

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

Set `STORAGE_BACKEND=mysql` and `DATABASE_URL` in `.env`. The database is **self-hosted MySQL** — Prisma is only the ORM/migration tool, not the database server.

**Local dev (Docker MySQL):**

```bash
docker compose -f docker-compose.mysql.yml up -d
./scripts/setup-database.sh
```

`.env`:

```env
STORAGE_BACKEND=mysql
DATABASE_URL=mysql://calisto:calisto@localhost:3306/calisto_chatbot
REDIS_URL=redis://localhost:6379
```

Browse tables with `npm run db:studio`. Caching is documented in [chatbot-integrations/CACHING.md](chatbot-integrations/CACHING.md). Database setup: [chatbot-integrations/prisma/README.md](chatbot-integrations/prisma/README.md).


For JSON-only storage (no MySQL), set `STORAGE_BACKEND=file`. See [chatbot-integrations/LEADS.md](chatbot-integrations/LEADS.md) and [chatbot-integrations/prisma/README.md](chatbot-integrations/prisma/README.md).

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

This also syncs `PUBLIC_BASE_URL` from the live tunnel (writing it to `.env` and recreating the Rasa action server) so product-card images are fetchable by WhatsApp/Telegram/Messenger. Without a public URL, those channels fall back to a generated placeholder image.

Instagram callback URLs must be set in the Meta App Dashboard (Instagram → API setup → Webhooks).

## Typical dev workflow

### Option 0: One-shot start (recommended)

```bash
cd chatbot-integrations
./scripts/start-all.sh
```

Then open **http://localhost:5173** for the admin UI.

### Option A: Fully Docker-based (production-like, manual terminals)

Run these in separate terminals:

```bash
# Terminal 1 — MySQL + Redis (local Docker)
cd chatbot-integrations && docker compose -f docker-compose.mysql.yml up -d

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

## Detailed Terminal Commands

### Option A: Docker-based Setup (Step-by-step)

#### First-time setup:

```bash
# 1. Start databases (PostgreSQL + Redis)
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
docker compose -f docker-compose.postgres.yml up -d

# 2. Setup database schema
./scripts/setup-database.sh

# 3. Build and train Rasa
cd ../calisto_nlp_export
docker compose down
rm -f models/*.tar.gz
docker compose build --no-cache rasa
mkdir -p models
docker compose run --rm rasa train

# 4. Start Rasa services
docker compose up -d

# 5. Setup backend dependencies
cd ../chatbot-integrations
npm install
cp .env.example .env
# Edit .env file with your settings
npm run db:migrate

# 6. Setup frontend dependencies
cd ../chatbot-frontend
npm install
cp .env.example .env
```

#### Daily startup (after first-time setup):

**Terminal 1 - Databases:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
docker compose -f docker-compose.postgres.yml up
# Or run detached: docker compose -f docker-compose.postgres.yml up -d
```

**Terminal 2 - Rasa (NLU + Actions):**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
docker compose up
# Or run detached: docker compose up -d
```

**Terminal 3 - Backend API:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
npm run dev
```

**Terminal 4 - Frontend:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-frontend
npm run dev
```

**Terminal 5 - Cloudflare Tunnel (optional, for webhooks):**
```bash
cloudflared tunnel --url http://localhost:3000
```

#### Useful Docker commands:

```bash
# Check running containers
docker ps

# View logs
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
docker compose logs -f rasa
docker compose logs -f actions

cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
docker compose -f docker-compose.postgres.yml logs -f postgres
docker compose -f docker-compose.postgres.yml logs -f redis

# Stop services
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
docker compose down

cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
docker compose -f docker-compose.postgres.yml down

# Restart services
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
docker compose restart rasa
docker compose restart actions

# Rebuild after code changes
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
docker compose down
docker compose build --no-cache
docker compose run --rm rasa train  # If model changed
docker compose up -d
```

---

### Option B: Hybrid Local Setup (Step-by-step)

#### First-time setup:

```bash
# 1. Create Python virtual environment
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
python3 -m venv .venv
source .venv/bin/activate

# 2. Install Rasa and dependencies
pip install --upgrade pip
pip install rasa==3.6.21
pip install redis==4.6.0
pip install -r requirements.txt

# 3. Start databases (PostgreSQL + Redis)
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1
docker compose -f docker-compose.services.yml up -d

# 4. Setup database schema
cd chatbot-integrations
./scripts/setup-database.sh

# 5. Train Rasa model
cd ../calisto_nlp_export
source .venv/bin/activate
rasa train

# 6. Setup backend dependencies
cd ../chatbot-integrations
npm install
cp .env.example .env
# Edit .env file with:
# DATABASE_URL=postgresql://calisto:calisto@localhost:5432/calisto_chatbot
# REDIS_URL=redis://localhost:6379
# RASA_URL=http://localhost:5005
npm run db:migrate

# 7. Setup frontend dependencies
cd ../chatbot-frontend
npm install
cp .env.example .env
# Leave VITE_API_BASE_URL empty for local dev
```

#### Daily startup (after first-time setup):

**Terminal 1 - Databases:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1
docker compose -f docker-compose.services.yml up
# Or run detached: docker compose -f docker-compose.services.yml up -d

# Verify services are running:
docker ps
# Should show postgres and redis containers
```

**Terminal 2 - Rasa NLU Server:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
source .venv/bin/activate
rasa run --enable-api --cors "*" --port 5005

# You should see:
# Rasa server is up and running on http://localhost:5005
```

**Terminal 3 - Rasa Action Server:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
source .venv/bin/activate
rasa run actions --port 5055

# You should see:
# Action endpoint is up and running on http://localhost:5055
```

**Terminal 4 - Backend API:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
npm run dev

# You should see:
# Server running on http://localhost:3000
```

**Terminal 5 - Frontend:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-frontend
npm run dev

# You should see:
# Local: http://localhost:5173/
```

**Terminal 6 - Cloudflare Tunnel (optional, for webhooks):**
```bash
cloudflared tunnel --url http://localhost:3000

# Copy the generated URL (e.g., https://xxx.trycloudflare.com)
# Update webhook URLs if needed:
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
./scripts/set-meta-webhooks.sh
```

#### When you make changes:

**After changing Rasa training data (NLU, stories, rules, domain):**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
source .venv/bin/activate
rasa train
# Then restart Terminal 2 (Rasa server) - Ctrl+C and run again
```

**After changing Rasa actions (Python code):**
```bash
# Just restart Terminal 3 (Action server) - Ctrl+C and run again
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
source .venv/bin/activate
rasa run actions --port 5055
```

**After changing backend code:**
```bash
# Hot reload is automatic with npm run dev
# If needed, restart Terminal 4 - Ctrl+C and run again
```

**After changing frontend code:**
```bash
# Hot reload is automatic with npm run dev
# If needed, restart Terminal 5 - Ctrl+C and run again
```

#### Useful local commands:

```bash
# Check if ports are in use
lsof -i :5005  # Rasa server
lsof -i :5055  # Rasa actions
lsof -i :3000  # Backend API
lsof -i :5173  # Frontend
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Kill process on port (if needed)
kill -9 $(lsof -t -i:5005)

# Check database connection
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
psql postgresql://calisto:calisto@localhost:5432/calisto_chatbot

# Check Redis connection
redis-cli -h localhost -p 6379 ping
# Should return: PONG

# View Redis data
redis-cli -h localhost -p 6379
> KEYS *
> GET <key>
> exit

# View database with Prisma Studio
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
npm run db:studio
# Opens http://localhost:5555

# Test Rasa endpoint
curl http://localhost:5005/

# Test backend health
curl http://localhost:3000/health

# View backend logs in real-time
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
npm run dev | grep ERROR  # Filter errors only

# Shutdown databases
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1
docker compose -f docker-compose.services.yml down

# Shutdown and remove volumes (clean slate)
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1
docker compose -f docker-compose.services.yml down -v
```

#### Troubleshooting:

**Rasa won't start:**
```bash
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export
source .venv/bin/activate
# Check if model exists
ls -la models/
# If no model, train one:
rasa train
```

**Database connection errors:**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# If not running, start it:
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1
docker compose -f docker-compose.services.yml up -d postgres

# Check connection:
psql postgresql://calisto:calisto@localhost:5432/calisto_chatbot -c "SELECT 1;"
```

**Redis connection errors:**
```bash
# Check if Redis is running
docker ps | grep redis

# If not running, start it:
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1
docker compose -f docker-compose.services.yml up -d redis

# Check connection:
redis-cli -h localhost -p 6379 ping
```

**Port already in use:**
```bash
# Find what's using the port
lsof -i :5005

# Kill the process
kill -9 <PID>

# Or kill all Rasa processes
pkill -f rasa
```

**Frontend not loading:**
```bash
# Clear npm cache and reinstall
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

**Backend not connecting to Rasa:**
```bash
# Check RASA_URL in .env
cd /Users/aswanthb/Documents/GitHub/Calisto-Module1/chatbot-integrations
cat .env | grep RASA_URL
# Should be: RASA_URL=http://localhost:5005

# Test Rasa endpoint
curl http://localhost:5005/
```

---

### Access URLs

Once all services are running:

- **Frontend (Admin UI)**: http://localhost:5173
  - Leads: http://localhost:5173/leads
  - Products: http://localhost:5173/products
  - Knowledge: http://localhost:5173/knowledge
  - Webchat Playground: http://localhost:5173/webchat
  - Customer Chat Widget: http://localhost:5173/chatbot

- **Backend API**: http://localhost:3000
  - Health: http://localhost:3000/health
  - Leads API: http://localhost:3000/reports/leads
  - Products API: http://localhost:3000/admin/products/api/products
  - Webchat: http://localhost:3000/webchat/message

- **Rasa Server**: http://localhost:5005
  - Status: http://localhost:5005/status
  - Version: http://localhost:5005/version

- **Rasa Actions**: http://localhost:5055
  - Health: http://localhost:5055/health

- **Prisma Studio** (Database UI): http://localhost:5555
  - Run: `cd chatbot-integrations && npm run db:studio`

- **PostgreSQL**: localhost:5432
  - Connect: `psql postgresql://calisto:calisto@localhost:5432/calisto_chatbot`

- **Redis**: localhost:6379
  - Connect: `redis-cli -h localhost -p 6379`
