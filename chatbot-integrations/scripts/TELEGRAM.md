# Telegram Chatbot (Full Run Guide)

This integration uses a **Telegram webhook** that points at the Node integration layer’s endpoint:

`POST /webhooks/telegram` (served by `chatbot-integrations` on port `3000`).

Because Telegram must reach your machine over the public internet, you need a **public HTTPS URL** (ngrok, Cloudflare Tunnel, etc.) that forwards to `http://localhost:3000`.

## Prereqs

- Rasa server reachable from the integration layer (`RASA_URL` in `chatbot-integrations/.env`).
  - In this repo’s native setup we typically use `http://localhost:5015`.
- Integration server running locally on `PORT=3000`.
- `TELEGRAM_BOT_TOKEN` set in `chatbot-integrations/.env`.
- (Recommended) `TELEGRAM_SECRET_TOKEN` set in `chatbot-integrations/.env`.
  - This enables Telegram’s `x-telegram-bot-api-secret-token` validation.

## 1) Start the chatbot backend services

Start whichever stack you’re using:

### Option A — Native (as used in local dev)

In separate terminals:

```bash
cd calisto_nlp_export
source .venv/bin/activate
rasa run actions --port 5055
```

```bash
cd calisto_nlp_export
source .venv/bin/activate
rasa run --enable-api --cors "*" --endpoints endpoints.yml --credentials credentials.yml --port 5015
```

```bash
cd calisto_nlp_export
./.venv_reasoning/bin/uvicorn reasoning_service.server:app --host 0.0.0.0 --port 8000
```

Sanity checks:

```bash
curl -s http://localhost:5015/status | python3 -m json.tool
curl -s http://localhost:8000/health | python3 -m json.tool
```

### Option B — Docker (NLP only)

If you’re running Rasa via Docker, make sure `RASA_URL` matches your exposed port (often `http://localhost:5005`).

## 2) Start the integration server (Telegram webhook handler)

```bash
cd chatbot-integrations
npm install
npm run dev
```

Sanity check:

```bash
curl -s http://localhost:3000/health | python3 -m json.tool
```

## 3) Expose port 3000 publicly (ngrok)

In a new terminal:

```bash
ngrok http 3000
```

Copy the **HTTPS** forwarding URL (example):

`https://<something>.ngrok-free.dev`

Confirm the public URL can reach your server:

```bash
curl -s https://<something>.ngrok-free.dev/health | python3 -m json.tool
```

## 4) Register the Telegram webhook

This repo includes a safe helper script that reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_SECRET_TOKEN` from `chatbot-integrations/.env` and calls Telegram’s `setWebhook`.

```bash
cd chatbot-integrations
npm run telegram:webhook -- https://unstrange-brooklynn-exhaustively.ngrok-free.dev
```

Expected output (example):

- `Telegram webhook configured`
- `url: https://<something>.ngrok-free.dev/webhooks/telegram`

Notes:

- The script sets `drop_pending_updates: true` to clear any queued updates from old webhook URLs.
- If you set `TELEGRAM_SECRET_TOKEN`, Telegram will include it in webhook requests and the server will reject requests with a mismatched token.

## 5) Chat from Telegram

Open Telegram, find your bot, press **Start**, and send `hi`.

You should see logs in the `npm run dev` terminal indicating an inbound Telegram update and an outbound reply.

## Troubleshooting

### 401 from `/webhooks/telegram`

Cause: secret token mismatch.

- Ensure `TELEGRAM_SECRET_TOKEN` in `chatbot-integrations/.env` matches what was registered in Telegram.
- Re-run webhook registration after changing secrets:

```bash
cd chatbot-integrations
npm run telegram:webhook -- https://<something>.ngrok-free.dev
```

### Bot doesn’t receive messages

- Confirm the webhook is set to your current tunnel URL (ngrok URLs change when restarted).
- Confirm public reachability:

```bash
curl -s https://unstrange-brooklynn-exhaustively.ngrok-free.dev/health | python3 -m json.tool
```

### Port 3000 already in use

Stop the existing process or free the port:

```bash
lsof -tiTCP:3000 -sTCP:LISTEN | xargs kill
```
