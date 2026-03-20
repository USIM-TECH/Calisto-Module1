# Lead Integration

This document explains how lead capture works in `chatbot-integrations`, where the data is stored, how to view it, and how CRM sync fits into the flow.

## Overview

The integration layer now does more than forward messages to Rasa.

It:

- receives messages from all supported channels
- sends user input to Rasa
- reads tracker/slot data back from Rasa
- persists leads and conversations
- stores webhook events for reporting
- syncs qualified leads to HubSpot when configured

## Supported Sources

Lead records can be created from:

- WhatsApp
- Instagram
- Facebook Messenger
- Telegram
- X
- Website Chat

## Lead Capture Flow

1. A user sends a message on any supported channel.
2. The integration service creates or updates a lead record.
3. The message is sent to Rasa.
4. Rasa fills lead-related slots such as:
   - `lead_name`
   - `contact_number`
   - `email`
   - `lead_location`
   - `preferred_service`
   - `purchase_timeline`
5. The integration service reads the tracker state from Rasa.
6. The lead record is updated with the captured slot values.
7. If the lead is marked as `qualified`, the integration attempts CRM sync.

For WhatsApp specifically:

- if the user does not explicitly type a phone number
- the integration falls back to the WhatsApp sender id as the lead phone number

That ensures sales still has a direct contact path even when the user skips the phone prompt.

## Stored Data

Runtime data is persisted through a **`RuntimeStore`** implementation:

| Mode | Configuration | Location |
|------|---------------|----------|
| **PostgreSQL (default)** | `STORAGE_BACKEND=postgres` (default) and `DATABASE_URL` | Tables managed by [Prisma](prisma/schema.prisma) |
| **File (fallback / opt-in)** | `STORAGE_BACKEND=file`, or postgres requested without `DATABASE_URL` | [`data/runtime/runtime-store.json`](data/runtime/runtime-store.json) |

In both cases the logical model is the same:

- **leads** — one row per `(channel, sourceId)` user
- **conversations** — transcript threads with nested **messages**
- **webhookEvents** — inbound channel webhook payloads for debugging/audit
- **deduplication** — short-lived keys to drop duplicate deliveries (`DEDUP_TTL_MS`)

### Retention (PostgreSQL)

- **Webhook events**: after each insert, rows older than the newest **999** (by `receivedAt`) are deleted, matching the previous file-store cap.
- **Dedupe keys**: entries with `seenAt` older than `DEDUP_TTL_MS` are removed when processing a new dedupe check.

Setup commands and migrations: [prisma/README.md](prisma/README.md).

### Importing legacy JSON into Postgres

If you have an existing `runtime-store.json`:

```bash
DATABASE_URL=... npm run db:import-json
```

Optional path: `npm run db:import-json -- /path/to/runtime-store.json`

## Lead Record Fields

Each lead may contain:

- `id`
- `channel`
- `sourceId`
- `conversationId`
- `senderName`
- `leadName`
- `email`
- `phone`
- `preferredService`
- `location`
- `qualificationStatus`
- `crmStatus`
- `crmRecordId`
- `lastIntent`
- `createdAt`
- `updatedAt`

## Reporting Endpoints

Available endpoints:

- `GET /reports/overview`
- `GET /reports/leads`
- `GET /reports/leads-dashboard`

Examples:

```bash
curl http://localhost:3000/reports/overview
curl http://localhost:3000/reports/leads
```

The browser dashboard is available at:

```bash
http://localhost:3000/reports/leads-dashboard
```

Dashboard features:

- KPI summary cards
- channel and status filters
- search by name, phone, email, location, or source id
- direct WhatsApp and email actions when available
- lead detail panel
- recent transcript preview

## CRM Sync

If `HUBSPOT_ACCESS_TOKEN` is configured, qualified leads are synced to HubSpot.

Current behavior:

- search contact by email/phone
- create or update contact
- create a HubSpot lead record
- mark local lead as:
  - `synced`
  - or `failed`

## Website Chat Security

Website chat supports:

- bearer auth via `WEBSITE_AUTH_TOKEN`
- origin restriction via `WEBSITE_ALLOWED_ORIGINS`
- rate limiting via:
  - `WEBSITE_RATE_LIMIT_MAX`
  - `WEBSITE_RATE_LIMIT_WINDOW_MS`

## Important Files

- [lead-orchestrator.ts](src/leads/orchestration/lead-orchestrator.ts)
- [runtime-store.interface.ts](src/leads/storage/runtime-store.interface.ts)
- [file-runtime-store.ts](src/leads/storage/file-runtime-store.ts)
- [prisma-runtime-store.ts](src/leads/storage/prisma-runtime-store.ts)
- [create-runtime-store.ts](src/leads/storage/create-runtime-store.ts)
- [records.ts](src/leads/types/records.ts)
- [file-json-store.ts](src/leads/storage/file-json-store.ts)
- [prisma/schema.prisma](prisma/schema.prisma)
- [create-app.ts](src/app/create-app.ts)
- [dependencies.ts](src/app/dependencies.ts)

## Notes

- **PostgreSQL** is the default; set `DATABASE_URL` and run migrations before starting.
- **File** storage: set `STORAGE_BACKEND=file`. If the default (`postgres`) is kept but `DATABASE_URL` is missing, the app falls back to JSON and logs a warning.
- Website chat **rate limits** stay in-memory (`website-rate-limiter.ts`); use Redis later if you scale horizontally.
