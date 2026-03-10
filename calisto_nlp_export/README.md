# Calisto Eyewear – NLP Service

Standalone Rasa NLP service for the Calisto Eyewear chatbot. Connects to any Node.js (or other) backend via REST API.

---

## Folder Structure

```
calisto_nlp_export/
├── data/
│   ├── nlu.yml          ← NLU training examples (intents, entities)
│   ├── stories.yml      ← Conversation flows
│   └── rules.yml        ← Deterministic dialogue rules
├── actions/
│   ├── __init__.py
│   └── actions.py       ← Custom actions (frame recommendations, order tracking, stores)
├── models/
│   └── *.tar.gz         ← Pre-trained model (ready to use, no training needed)
├── domain.yml           ← Intents, entities, slots, responses
├── config.yml           ← NLU pipeline & dialogue policies
├── endpoints.yml        ← Action server URL config
├── credentials.yml      ← Channel credentials (REST, Socket.IO, WhatsApp, etc.)
├── requirements.txt     ← Python dependencies
├── start.sh             ← Startup script
└── calisto_rasa_client.js  ← Node.js integration example
```

---

## Setup & Run

### 1. Install Python dependencies
```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install rasa==3.6.21 rasa-sdk==3.6.2
```

### 2. Start the NLP service
```bash
chmod +x start.sh
./start.sh
```

This starts:
- **Rasa REST API** on `http://localhost:5005`
- **Action Server** on `http://localhost:5055`

The pre-trained model in `models/` loads automatically — **no training needed**.

### 3. Test it
```bash
curl -X POST http://localhost:5005/webhooks/rest/webhook \
  -H "Content-Type: application/json" \
  -d '{"sender": "test_user", "message": "hi"}'
```

---

## Node.js Integration

Copy `calisto_rasa_client.js` into your Node project:

```bash
npm install axios express
node calisto_rasa_client.js
```

Then call from your Node backend:

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
  { "recipient_id": "user1", "text": "Welcome to Calisto Eyewear!..." }
]
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

## Re-training (if you update NLU data)

```bash
source .venv/bin/activate
rasa train
# New model saved to models/
```

---

## Supported Features

| Feature | Trigger phrase example |
|---|---|
| Frame recommendation | "show me round glasses for men" |
| Face shape advice | "I have a round face, what frames suit me?" |
| Lens info | "what types of lenses do you have?" |
| Lens pricing | "how much do progressive lenses cost?" |
| Store locator | "find a store in Mumbai" |
| Order tracking | "track my order ORD12345" |
| Eye test booking | "book an eye test in Delhi" |
