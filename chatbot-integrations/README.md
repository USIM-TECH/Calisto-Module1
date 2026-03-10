# Chatbot Integrations

> Standalone integration layer extracted from the [Botpress Cloud](https://github.com/botpress/botpress) open-source repository.

A self-contained Node.js/TypeScript module that provides messaging channel integrations (WhatsApp, Instagram, Messenger), CRM (HubSpot), data storage (Google Sheets), and email notifications (Gmail) — ready to plug into any chatbot or NLP engine.

## 📁 Project Structure

```
chatbot-integrations/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
└── src/
    ├── index.ts              # Main barrel exports
    ├── server.ts             # Express entry point with webhook routes
    ├── types.ts              # Shared types (IncomingMessage, OutgoingMessage, etc.)
    │
    ├── auth/                 # Auth helpers
    │   └── index.ts          # Meta signature verification, Google OAuth helpers
    │
    ├── channels/             # Messaging channel integrations
    │   ├── whatsapp/
    │   │   ├── client.ts     # WhatsAppChannel class (send/receive via Meta Cloud API)
    │   │   ├── types.ts      # Zod schemas for WhatsApp webhook payloads
    │   │   ├── formatting.ts # Markdown → WhatsApp RTF converter + text splitter
    │   │   └── index.ts
    │   ├── instagram/
    │   │   ├── client.ts     # InstagramChannel class (Meta Graph API v21.0)
    │   │   ├── types.ts      # Zod schemas for Instagram webhook payloads
    │   │   └── index.ts
    │   └── messenger/
    │       ├── client.ts     # MessengerChannel class (Meta Graph API v23.0)
    │       ├── types.ts      # Zod schemas for Messenger webhook payloads
    │       └── index.ts
    │
    ├── crm/                  # CRM integrations
    │   └── hubspot/
    │       ├── client.ts     # HubSpotClient (contacts, companies, deals, leads)
    │       └── index.ts
    │
    ├── data/                 # Data storage integrations
    │   └── gsheets/
    │       ├── client.ts     # GSheetsClient (read/write/manage spreadsheets)
    │       └── index.ts
    │
    ├── notifications/        # Notification integrations
    │   └── email/
    │       ├── client.ts     # GmailEmailClient (send/read/manage email)
    │       └── index.ts
    │
    ├── utils/                # Shared utilities
    │   ├── logger.ts         # Logger interface + ConsoleLogger
    │   ├── helpers.ts        # Signature validation, chunking, etc.
    │   └── index.ts
    │
    └── webhook/              # Express webhook router
        ├── router.ts         # Routes /webhooks/whatsapp, /instagram, /messenger
        └── index.ts
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd chatbot-integrations
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

### 3. Build & Run

```bash
npm run build
npm start
```

The server starts on port 3000 (configurable via `PORT` env var).

### 4. Set Up Webhooks

Point your Meta webhook URLs to:
- **WhatsApp**: `https://your-domain.com/webhooks/whatsapp`
- **Instagram**: `https://your-domain.com/webhooks/instagram`
- **Messenger**: `https://your-domain.com/webhooks/messenger`

Health check: `GET /health`

## 🔌 NLP Connection Point

Each channel has an `onMessage` callback. This is where you connect your NLP/chatbot engine:

```typescript
import { WhatsAppChannel, IncomingMessage } from './src/index.js'

const whatsapp = new WhatsAppChannel({ /* config */ }, logger)

whatsapp.onMessage(async (message: IncomingMessage) => {
  // 1. Send to your NLP engine
  const nlpResponse = await myNLP.process(message.text)

  // 2. Reply via the channel
  await whatsapp.sendMessage(message.senderId, {
    type: 'text',
    text: nlpResponse.answer,
  })
})
```

## 📦 Programmatic Usage (as a library)

You can also import individual clients without the Express server:

```typescript
import {
  WhatsAppChannel,
  InstagramChannel,
  MessengerChannel,
  HubSpotClient,
  GSheetsClient,
  GmailEmailClient,
} from 'chatbot-integrations'

// Create a WhatsApp client
const wa = new WhatsAppChannel({
  accessToken: 'your-token',
  phoneNumberId: 'your-phone-id',
  verifyToken: 'your-verify-token',
}, logger)

// Send a message
await wa.sendMessage('+1234567890', { type: 'text', text: 'Hello!' })

// Create a HubSpot client
const hs = new HubSpotClient({ accessToken: 'your-hubspot-token' }, logger)
const contact = await hs.searchContact({ email: 'user@example.com' })

// Read from Google Sheets
const gs = new GSheetsClient({
  clientId: '...',
  clientSecret: '...',
  refreshToken: '...',
  spreadsheetId: '...',
}, logger)
const data = await gs.getValues('Sheet1!A1:D10')

// Send an email
const gmail = new GmailEmailClient({
  clientId: '...',
  clientSecret: '...',
  refreshToken: '...',
}, logger)
await gmail.sendEmail({ to: 'user@example.com', subject: 'Hello', body: 'World' })
```

## 🔑 Required Credentials

### WhatsApp (Meta Cloud API)
- `WHATSAPP_ACCESS_TOKEN` — permanent or system user access token
- `WHATSAPP_PHONE_NUMBER_ID` — from Meta Business Manager
- `WHATSAPP_VERIFY_TOKEN` — any string you choose for webhook verification
- `WHATSAPP_CLIENT_SECRET` — (optional) for signature verification

### Instagram (Meta Graph API)
- `INSTAGRAM_ACCESS_TOKEN` — long-lived access token
- `INSTAGRAM_ID` — Instagram Business account ID
- `INSTAGRAM_VERIFY_TOKEN` — webhook verify token
- `INSTAGRAM_CLIENT_ID` / `INSTAGRAM_CLIENT_SECRET` — from Meta App

### Messenger (Meta Graph API)
- `MESSENGER_PAGE_ACCESS_TOKEN` — page access token
- `MESSENGER_PAGE_ID` — Facebook Page ID
- `MESSENGER_VERIFY_TOKEN` — webhook verify token
- `MESSENGER_CLIENT_ID` / `MESSENGER_CLIENT_SECRET` — from Meta App

### HubSpot
- `HUBSPOT_ACCESS_TOKEN` — private app or OAuth access token

### Google (Sheets & Gmail)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `GOOGLE_REFRESH_TOKEN` / `GMAIL_REFRESH_TOKEN` — from OAuth flow
- `GSHEETS_SPREADSHEET_ID` — target spreadsheet ID

## 📝 Key Design Decisions

1. **No Botpress SDK dependency** — All `@botpress/sdk` imports have been replaced with standalone types and utilities.
2. **Framework-agnostic core** — Channel clients work standalone; the Express server is optional.
3. **Zod validation** — All incoming webhook payloads are validated with Zod schemas (preserved from original).
4. **No NLP logic** — This is a pure integration layer. The `onMessage` callback is the hook point for your bot logic.
5. **Original logic preserved** — Message formatting, markdown conversion, text splitting, and API interactions are extracted without modification.

## 📄 Source

Extracted from: [botpress/botpress](https://github.com/botpress/botpress) (MIT License)

Integrations extracted:
- `integrations/whatsapp/`
- `integrations/instagram/`
- `integrations/messenger/`
- `integrations/hubspot/`
- `integrations/gsheets/`
- `integrations/gmail/`
