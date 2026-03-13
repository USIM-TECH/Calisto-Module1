# Calisto Eyewear – NLP Service

Standalone Rasa NLP service for the Calisto Eyewear chatbot. Connects to any Node.js (or other) backend via REST API.

The chatbot's structured knowledge base and RAG document retrieval are backed by PostgreSQL. This repository no longer uses local `knowledge_base/` seed files at runtime.

> **Note:** Rasa 3.6.x requires Python 3.8–3.10. The recommended way to run this service is via **Docker**, which bundles the correct Python version automatically.

---

## Folder Structure

```
calisto_nlp_export/
├── data/
│   ├── nlu.yml              ← NLU training examples (intents, entities)
│   ├── stories.yml          ← Conversation flows
│   └── rules.yml            ← Deterministic dialogue rules
├── actions/
│   ├── __init__.py
│   └── actions.py           ← Custom actions (frame recommendations, order tracking, stores)
├── models/
│   └── *.tar.gz             ← Pre-trained model (ready to use)
├── domain.yml               ← Intents, entities, slots, responses
├── config.yml               ← NLU pipeline & dialogue policies
├── endpoints.yml            ← Action server URL config
├── credentials.yml          ← Channel credentials (REST, Socket.IO, etc.)
├── Dockerfile               ← Rasa NLP server image (rasa/rasa:3.6.21)
├── Dockerfile.actions       ← Action server image (rasa/rasa-sdk:3.6.2)
├── docker-compose.yml       ← Orchestrates both containers
├── requirements.txt         ← Python dependencies (for local setup)
├── start.sh                 ← Local startup script (requires Python 3.8–3.10)
└── calisto_rasa_client.js   ← Node.js integration example
```

---

## Setup & Run (Docker — Recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed

### 1. Start the NLP service

```bash
docker compose up -d --build
```

This builds and starts three containers:

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `postgres` | `pgvector/pgvector:pg16` | `5432` | Knowledge-base storage + vector search |
| `rasa` | `rasa/rasa:3.6.21` | `5005` | NLP server (REST API) |
| `action-server` | `rasa/rasa-sdk:3.6.2` | `5055` | Custom actions (Python) |

The containers are connected via an internal Docker network (`calisto-net`). The action server auto-creates the PostgreSQL schema and enables the `vector` extension. Populate the database before starting the bot if you are setting up a fresh environment.

### 2. Verify containers are running

```bash
docker compose ps
```

Expected output:
```
NAME                             IMAGE                             STATUS    PORTS
calisto_nlp_export-postgres-1    postgres:16-alpine                Up        0.0.0.0:5432->5432/tcp
calisto_nlp_export-rasa-1        calisto_nlp_export-rasa           Up        0.0.0.0:5005->5005/tcp
calisto_nlp_export-action-...    calisto_nlp_export-action-...     Up        0.0.0.0:5055->5055/tcp
```

### 3. Wait for the model to load (~20–30 seconds), then test

```bash
curl -X POST http://localhost:5005/webhooks/rest/webhook \
  -H "Content-Type: application/json" \
  -d '{"sender": "test_user", "message": "hi"}'
```

### 4. View logs

```bash
# All services
docker compose logs -f

# Rasa only
docker compose logs -f rasa

# Action server only
docker compose logs -f action-server

# PostgreSQL only
docker compose logs -f postgres
```

### 5. Stop the service

```bash
docker compose down
```

---

## PostgreSQL Knowledge Base

Runtime KB access now goes through PostgreSQL.

Default connection settings:

```bash
KB_DB_HOST=localhost
KB_DB_PORT=5432
KB_DB_NAME=calisto_kb
KB_DB_USER=calisto
KB_DB_PASSWORD=calisto
```

You can also supply a single connection string:

```bash
export KB_DATABASE_URL=postgresql://calisto:calisto@localhost:5432/calisto_kb
```

### Rebuild runtime RAG embeddings in PostgreSQL

After updating KB documents in PostgreSQL, rebuild the pgvector embeddings used for runtime retrieval:

```bash
python scripts/build_index.py
```

## Setup & Run (Local — Requires Python 3.8–3.10)

> ⚠️ Rasa 3.6.x does **not** support Python 3.11+. If your system Python is newer, use Docker instead.

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

chmod +x start.sh
./start.sh
```

---

## Docker Architecture

```
┌─────────────────────────────────────────────────┐
│              Docker Network (calisto-net)        │
│                                                 │
│  ┌─────────────────┐    ┌────────────────────┐  │
│  │   rasa           │    │  action-server      │  │
│  │   (Rasa 3.6.21)  │───▶│  (rasa-sdk 3.6.2)  │  │
│  │   Port: 5005     │    │  Port: 5055         │  │
│  └────────┬─────────┘    └────────────────────┘  │
│           │                                      │
└───────────┼──────────────────────────────────────┘
            │
            ▼
    Host: http://localhost:5005
```

- **Rasa server** receives user messages, runs NLU classification, manages dialogue state
- **Action server** executes custom Python actions and reads knowledge-base data from PostgreSQL
- **PostgreSQL** stores product rows, store metadata, order records, prompts/responses, and searchable document segments
- Rasa calls the action server at `http://action-server:5055/webhook` (configured in `endpoints.yml`)

---

## Node.js Integration

Copy `calisto_rasa_client.js` into your Node project:

```bash
npm install axios express
node calisto_rasa_client.js
```

Or call Rasa directly from your Node backend:

```javascript
const axios = require("axios");

const reply = await axios.post("http://localhost:5005/webhooks/rest/webhook", {
  sender: userId,
  message: userMessage,
});

const botReplies = reply.data; // [{ text: "..." }, ...]
```

---

## API Reference

### Send a message
```
POST http://localhost:5005/webhooks/rest/webhook
Content-Type: application/json

{ "sender": "<unique_user_id>", "message": "<user text>" }
```

**Response:**
```json
[
  { "recipient_id": "user1", "text": "Welcome to Calisto Eyewear! 👓..." }
]
```

### Parse intent (without triggering dialogue)
```
POST http://localhost:5005/model/parse
Content-Type: application/json

{ "text": "I want round glasses" }
```

**Response:**
```json
{
  "intent": { "name": "search_frames", "confidence": 0.98 },
  "entities": [{ "entity": "frame_style", "value": "round" }]
}
```

### Health check
```
GET http://localhost:5005/health
```

### Reset a user session
```
POST http://localhost:5005/conversations/<sender_id>/tracker/events
Content-Type: application/json

[{ "event": "restart" }]
```

---

## Re-training the Model

If you update training data in `data/`, you need to retrain.

If you update KB documents in PostgreSQL, rebuild the pgvector embeddings before training or starting the action server.

### Via Docker (recommended)
```bash
docker run --rm -v "$(pwd)":/app -w /app -u root rasa/rasa:3.6.21 \
  train --domain domain.yml --data data/ --config config.yml --out models/
```

Then rebuild and restart:
```bash
docker compose down
docker compose up -d --build
```

### Via local Python (requires Python 3.8–3.10)
```bash
source .venv/bin/activate
python scripts/build_index.py
rasa train
# New model saved to models/
```

---

## Supported Features

| Feature | Trigger phrase example |
|---|---|
| Greeting | "hi", "hello", "hey" |
| Frame recommendation | "show me round glasses for men" |
| Face shape advice | "I have a round face, what frames suit me?" |
| Lens info | "what types of lenses do you have?" |
| Lens pricing | "how much do progressive lenses cost?" |
| Store locator | "find a store in Mumbai" |
| Order tracking | "track my order ORD12345" |
| Eye test booking | "book an eye test in Delhi" |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `rasa` container exits immediately | Check logs: `docker compose logs rasa` — likely a corrupt model. Retrain. |
| `model/parse` returns `nlu_fallback` for everything | Model may be stale. Retrain with the command above. |
| Action server errors (`InvalidURL`) | Verify `endpoints.yml` has `url: "http://action-server:5055/webhook"` (no `${...}` syntax). |
| Python version error (local setup) | Rasa 3.6.x needs Python 3.8–3.10. Use Docker instead. |
| Port 5005 already in use | Stop existing containers: `docker compose down`, or kill the process: `lsof -ti :5005 \| xargs kill -9` |
