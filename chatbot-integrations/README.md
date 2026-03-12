# Chatbot Integrations

Production-facing integration layer for Calisto chatbot channels and support services.

## Scope

Runtime entrypoint: [src/app/server.ts](./src/app/server.ts)

Primary responsibilities:
- receive Meta webhooks for WhatsApp, Instagram, and Messenger
- normalize inbound events into shared message types
- forward text to the Rasa NLP service
- send the generated reply back through the originating channel

## Folder Layout

- `src/app`: server bootstrap and runtime message orchestration
- `src/config`: environment parsing and feature toggles
- `src/core`: shared types, webhook router, auth helpers, and utilities
- `src/integrations`: channel adapters and optional service clients

An optional HubSpot client is also exposed, but it is not part of the default webhook reply loop.

## Run

```bash
cd chatbot-integrations
npm install
cp .env.example .env
npm run build
npm start
```

Health endpoint:

```bash
curl http://localhost:3000/health
```

## Required Environment Variables

Core:
- `PORT`
- `RASA_URL`

WhatsApp:
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`

Instagram:
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_ID`
- `INSTAGRAM_VERIFY_TOKEN`

Messenger:
- `MESSENGER_PAGE_ACCESS_TOKEN`
- `MESSENGER_PAGE_ID`
- `MESSENGER_VERIFY_TOKEN`

## Webhook Endpoints

- `GET/POST /webhooks/whatsapp`
- `GET/POST /webhooks/instagram`
- `GET/POST /webhooks/messenger`
- `GET /health`

## Notes

- Raw webhook payloads are validated before channel processing.
- Empty env values are ignored by config loading.
- WhatsApp webhook handling now iterates all `entry` and `changes` items to avoid dropping batched events.
