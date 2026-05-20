# Calisto NLP Export

Rasa project used by the chatbot integration service.

> **Note:** Rasa 3.6.x requires Python 3.8–3.10. The recommended way to run this service is via **Docker**, which bundles the correct Python version automatically.

---

- `data/`: NLU, rules, and stories
- `domain.yml`: intents, slots, forms, responses
- `actions/actions.py`: custom actions and validators
- `knowledge_base/`: local CSV, DOCX, PDF, and retrieval index files
- `docker-compose.yml`: Rasa server + action server

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

The current action layer reads from the local `knowledge_base/` folder. Product, brand, city, and store-location lookups come from `knowledge_base/calisto_product_catalog_500.csv`, while document Q&A uses the local FAISS/BM25 retrieval index under `knowledge_base/index/`. There is no PostgreSQL or external vector database dependency in the current branch.

## Multilingual Support

The bot currently supports:

- English `en`
- Malay `ms`
- Mandarin `zh`

The current multilingual design is Rasa-first:

- intent understanding comes from multilingual examples in [data/nlu.yml](./data/nlu.yml)
- language state is stored in the `preferred_language` slot in [domain.yml](./domain.yml)
- `action_set_language` in [actions/actions.py](./actions/actions.py) sets or preserves conversation language
- domain responses and custom actions localize text, buttons, and card labels based on that slot

Supporting a new or improved language requires all of these to move together:

1. parallel training examples per intent
2. canonical entity synonyms and lookups
3. localized responses in `domain.yml`
4. localized custom-action copy in `actions.py`
5. regression coverage in:
   - [MULTILINGUAL_INTENT_MATRIX.md](./MULTILINGUAL_INTENT_MATRIX.md)
   - [MULTILINGUAL_QA_REGRESSION.md](./MULTILINGUAL_QA_REGRESSION.md)

## Setup & Run (Docker — Recommended)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed

### 1. Start the NLP service

```bash
docker compose up -d --build
```

This builds and starts two containers:

| Container | Image | Port | Purpose |
|-----------|-------|------|---------|
| `rasa` | `rasa/rasa:3.6.21` | `5005` | NLP server (REST API) |
| `action-server` | `rasa/rasa-sdk:3.6.2` | `5055` | Custom actions (Python) |

The containers are connected via an internal Docker network (`calisto-net`). The Rasa server automatically loads the pre-trained model from `models/`.

The action server reads its runtime knowledge from:
- `knowledge_base/calisto_product_catalog_500.csv`
- `knowledge_base/index/calisto.faiss`
- `knowledge_base/index/calisto_meta.json`

### 2. Verify containers are running

```bash
docker compose ps
```

Expected output:
```
NAME                          IMAGE                          STATUS    PORTS
calisto_nlp_export-rasa-1     calisto_nlp_export-rasa        Up        0.0.0.0:5005->5005/tcp
calisto_nlp_export-action-..  calisto_nlp_export-action-..   Up        0.0.0.0:5055->5055/tcp
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
```

### 5. Stop the service

```bash
docker compose down
```

---
## Telegram Webhook Setup
```bash
curl -X POST "https://api.telegram.org/botTELEGRAM_BOT_TOKEN_PLACEHOLDER/setWebhook" \
-H "Content-Type: application/json" \
-d '{
  "url": "https://YOUR-NGROK-URL.ngrok-free.app/webhooks/telegram"
}'
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

If you run the action server directly, use:

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 rasa run actions
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
- **Action server** executes custom Python actions using the local knowledge base (catalog lookup, document retrieval, store locator)
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

### Recommended retrain flow for this project

When you update multilingual NLU, rules, or responses, use:

```bash
docker compose down
rm -f models/*.tar.gz
docker compose build --no-cache rasa
docker compose run --rm rasa train
docker compose up -d --build
```

After retraining, run through the checks in [MULTILINGUAL_QA_REGRESSION.md](./MULTILINGUAL_QA_REGRESSION.md).

### Via local Python (requires Python 3.8–3.10)
```bash
rasa train
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 rasa run actions
rasa shell
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
| Store locator | "find a store in Kuala Lumpur" |
| Order tracking | "track my order ORD12345" |
| Eye test booking | "book an eye test in Nilai" |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `rasa` container exits immediately | Check logs: `docker compose logs rasa` — likely a corrupt model. Retrain. |
| `model/parse` returns `nlu_fallback` for everything | Model may be stale. Retrain with the command above. |
| Action server errors (`InvalidURL`) | Verify `endpoints.yml` has `url: "http://action-server:5055/webhook"` (no `${...}` syntax). |
| Python version error (local setup) | Rasa 3.6.x needs Python 3.8–3.10. Use Docker instead. |
| Port 5005 already in use | Stop existing containers: `docker compose down`, or kill the process: `lsof -ti :5005 \| xargs kill -9` |



