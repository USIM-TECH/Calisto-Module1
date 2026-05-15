# Calisto Module 1

## Architecture

```
User message (WhatsApp / Instagram / Messenger / Telegram / X / Webchat)
        │
        ▼
chatbot-integrations (Node/TS, :3000)
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

The LLM layer lives in `chatbot-integrations/src/core/utils/llm-client.ts` and
is toggled with `LLM_LAYER_ENABLED=true|false` in `chatbot-integrations/.env`.
Thresholds: `RASA_NLU_CONFIDENCE_FLOOR` (default `0.4`, matches Rasa's
`FallbackClassifier`) and `LLM_CONFIDENCE_FLOOR` (default `0.35`).

### 0. Start Ollama + pull Llama 3 (one-time, only if LLM fallback is enabled)

```bash
# Install from https://ollama.com if you haven't
ollama serve &            # usually already running as a systemd/user service
ollama pull llama3
ollama list               # verify llama3 appears
```

The integration service expects Ollama at `http://localhost:11434`
(`OLLAMA_URL` / `OLLAMA_MODEL` in `chatbot-integrations/.env`).

## Quick Start

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



### 2. Start the integration service

```bash
cd chatbot-integrations
npm install
cp .env.example .env
npm run build
npm start
```

By default the integration layer uses **PostgreSQL** via Prisma: set `DATABASE_URL` in `.env`, run `npm run db:migrate:dev` (or `db:migrate` in production), then `npm start`. For JSON-only storage, set `STORAGE_BACKEND=file`. If `DATABASE_URL` is missing while postgres is selected, the service falls back to `data/runtime/runtime-store.json` and logs a warning. See [chatbot-integrations/LEADS.md](chatbot-integrations/LEADS.md) and [chatbot-integrations/prisma/README.md](chatbot-integrations/prisma/README.md).

Integration service endpoints:
- `http://localhost:3000/`
- `http://localhost:3000/health`
- `http://localhost:3000/webhooks/whatsapp`
- `http://localhost:3000/webhooks/instagram`
- `http://localhost:3000/webhooks/messenger`
- `http://localhost:3000/webchat`
- `http://localhost:3000/webchat/test`
- `http://localhost:3000/reports/leads-dashboard`

### 3. Telegram

See the full end-to-end Telegram runbook: [chatbot-integrations/scripts/TELEGRAM.md](chatbot-integrations/scripts/TELEGRAM.md)





### 3. Cloudflare tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```