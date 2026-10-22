# Calisto Module 1

Customer chatbot for Calisto (eyewear retailer) across WhatsApp, Instagram, Messenger, Telegram, X and website chat, plus an admin dashboard for leads, products and knowledge.

## How it works

```
Customer message (any channel)
        │
        ▼
chatbot-integrations  (Node/TypeScript API, :3000)
        │   picks a response mode per channel (set in the admin UI)
        │
        ├── payload mode (default) ──► Rasa (:5005) ──► action server (:5055)
        │      Rasa classifies the intent. If it is unsure (confidence < 0.4),
        │      Llama 3 classifies instead (LLM fallback).
        │
        └── chat mode ──► Llama 3 via Ollama (:11434)
               1. query-planner: classify intent + extract filters
               2. retriever: look up products / knowledge in MySQL
               3. answerer: write the reply from only that data
               (src/core/chat/)

chatbot-frontend  (React admin UI, :5173) ──► chatbot-integrations API
```

| Folder | What it is |
|---|---|
| `calisto_nlp_export/` | Rasa project (NLU data, stories, rules, custom actions) |
| `chatbot-integrations/` | Backend API: channel webhooks, chat mode, leads, products, auth. MySQL via Prisma, Redis cache |
| `chatbot-frontend/` | Admin dashboard (React + Vite) |

Response mode is chosen per channel: **Channels** page for social channels, **Webchat** page for the website. Anything unset uses `payload`.

## Prerequisites

Works the same on macOS, Windows (cmd or PowerShell, no WSL needed) and Linux. Install:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/): runs MySQL, Redis and Rasa
- [Node.js](https://nodejs.org) 18+ (includes npm)
- [Ollama](https://ollama.com/download): runs Llama 3 for chat mode
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/): only for connecting real channels (WhatsApp, Telegram, etc.)

You do not need Python. Rasa runs inside Docker.

## First-time setup

Run from the repo root. Commands are the same on every OS except file copy (`cp` on Mac/Linux, `copy` on Windows).

### 1. Llama 3

Make sure Ollama is running (the installer starts it; on Linux it runs as a service, on Mac `brew services start ollama` if installed with Homebrew), then:

```bash
ollama pull llama3            # about 4.7 GB
```

Check with `curl http://localhost:11434/api/tags` (Windows: open that URL in a browser). Run only one Ollama at a time; the app, a service and a Docker container all use port 11434. Without a GPU, chat replies are slow; raise `CHAT_TIMEOUT_MS` in `.env` if they time out.

### 2. Environment files

You will be given the contents of three `.env` files (keep them private; they hold secrets and are git-ignored). Create each file in the folder shown and paste the contents in:

| File to create | Holds |
|---|---|
| `chatbot-integrations/.env` | Backend config: tokens, keys, database, Ollama |
| `calisto_nlp_export/.env` | One line, `BACKEND_API_KEY=...` (Rasa uses it to read products from the backend) |
| `chatbot-frontend/.env` | `VITE_API_BASE_URL=` (leave the value empty) |

How to create them:

- **Any editor (VS Code recommended):** File > New File, paste, then Save As with the exact name `.env` in the right folder.
- **Windows:** Notepad often saves `.env` as `.env.txt` and File Explorer hides extensions. Use VS Code, or in cmd: `ren .env.txt .env`. Check with `dir /a` in the folder; the name must be exactly `.env`.
- **Mac/Linux:** files starting with a dot are hidden in Finder; use `ls -a` in the terminal to see them.

Each file is plain `NAME=value` lines, no quotes and no spaces around `=`.

### 3. Backend

```bash
cd chatbot-integrations
npm install
```

The `chatbot-integrations/.env` from step 2 already has the tokens, keys and local defaults filled in.

(Without one, `cp .env.example .env` gives a template, but `ADMIN_API_TOKEN` and `CHANNEL_CREDENTIALS_ENCRYPTION_KEY` must then be filled in with random strings from `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)

Start the database, create the tables and your login:

```bash
docker compose -f docker-compose.mysql.yml up -d     # MySQL :3306 + Redis :6379
npx prisma generate
npm run db:migrate
npm run db:seed:presets
npm run admin -- create --email you@example.com      # asks for a password
```

### 4. Rasa

Trained models are not in git, so train one. Rasa runs in Docker.

The `calisto_nlp_export/.env` from step 2 holds `BACKEND_API_KEY`, which must equal `ADMIN_API_TOKEN` in the backend `.env`; otherwise product lookups from Rasa fail with 401.

```bash
cd calisto_nlp_export
docker compose run --rm rasa train                   # a few minutes
```

### 5. Frontend

```bash
cd chatbot-frontend
npm install
```

## Daily start

Use four terminals (the first two only need to run once and stay up):

```bash
# 1. Database + Redis
cd chatbot-integrations
docker compose -f docker-compose.mysql.yml up -d

# 2. Rasa + action server
cd calisto_nlp_export
docker compose up -d

# 3. Backend
cd chatbot-integrations
npm run dev

# 4. Frontend
cd chatbot-frontend
npm run dev
```

Open http://localhost:5173 and sign in with the account you created.

| Service | Check |
|---|---|
| Admin UI | http://localhost:5173 |
| Backend | http://localhost:3000/health |
| Rasa | http://localhost:5005/version |

Stop with Ctrl+C in terminals 3 and 4, and `docker compose down` in each folder you started Docker from.

## Add data

The bot answers only from your data. In the admin UI add products on **Products** (CSV import works) and documents on **Knowledge**. With an empty database it has nothing to recommend.

## Connect a real channel (optional)

Webchat and the admin UI work without this. WhatsApp, Instagram, Messenger and Telegram need a public HTTPS URL:

1. Start a tunnel: `cloudflared tunnel --url http://localhost:3000`. Copy the `https://...trycloudflare.com` URL it prints.
2. Open the **Channels** page, add the account with its tokens, then use **Register webhook** and paste the tunnel URL.
3. The URL changes every time the tunnel restarts. Click **Reconnect all** to point every channel at the new one.

Instagram callback URLs must also be set in the Meta App Dashboard (Instagram > API setup > Webhooks).

## Testing the bot

1. Open http://localhost:5173 and sign in.
2. **Webchat** page: choose the response mode (Payload or Chat).
3. Open the **Chatbot** page (`/chatbot`) or the Webchat playground and send a message such as "show me sunglasses under 300".

To compare the two modes, switch the setting and ask the same question. Changes apply within about 5 seconds.

## When you change things

| Changed | Do |
|---|---|
| Backend or frontend code | Nothing, hot reload |
| Rasa training data (`data/`, `domain.yml`) | `cd calisto_nlp_export && docker compose run --rm rasa train && docker compose up -d --build` |
| Rasa custom actions (`actions/`) | `cd calisto_nlp_export && docker compose up -d --build action-server` |
| `prisma/schema.prisma` | `cd chatbot-integrations && npm run db:migrate:dev` |
| Chat mode behaviour | `chatbot-integrations/src/core/chat/` (prompts are in `query-planner.ts` and `answerer.ts`) |

Type-check the backend with `npm run check:type`; build the frontend with `npm run build`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Chat mode replies "Sorry, I am having trouble answering right now" and `[Chat] reply failed:` is blank in the backend log | Ollama is not running. Start it (desktop app, `brew services start ollama` on Mac, or `systemctl start ollama` on Linux) |
| Same, with 404 or "model not found" in the log | `ollama pull llama3` |
| `timeout of 30000ms exceeded` | Model is still loading or the machine is slow. Raise `CHAT_TIMEOUT_MS` in `.env` |
| Rasa will not start or says no model found | Train one: `cd calisto_nlp_export && docker compose run --rm rasa train`, then `docker compose up -d` |
| Rasa answers but product results are empty or the action server gets 401 | The backend must be running on :3000 and the Products page must have data. For Rasa in Docker, `BACKEND_API_KEY` in `calisto_nlp_export/.env` must equal `ADMIN_API_TOKEN` |
| Port already in use | Another copy is running. Mac/Linux: `lsof -i :<port>`. Windows: `netstat -ano` and look for the port, then end that process in Task Manager. Also check `docker ps` for old containers |
| Cannot connect to the database | `docker ps` should show `calisto-mysql` and `calisto-redis` as healthy. If not, rerun the `docker compose ... up -d` command |
| Product images missing on WhatsApp, Telegram or Messenger | Set `PUBLIC_BASE_URL` in `chatbot-integrations/.env` to the tunnel URL and restart the backend |

## More documentation

- `chatbot-integrations/prisma/README.md`: database and migrations
- `chatbot-frontend/README.md`, `calisto_nlp_export/README.md`
