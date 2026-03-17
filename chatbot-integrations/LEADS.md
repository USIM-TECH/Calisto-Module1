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

Runtime data is stored in:

[runtime-store.json](/Users/darshan/projects/USIM%20Tech/Calisto/Calisto-Module1/chatbot-integrations/data/runtime/runtime-store.json)

The store contains:

- `leads`
- `conversations`
- `webhookEvents`
- `deduplication`

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

- [lead-orchestrator.ts](/Users/darshan/projects/USIM%20Tech/Calisto/Calisto-Module1/chatbot-integrations/src/app/lead-orchestrator.ts)
- [runtime-store.ts](/Users/darshan/projects/USIM%20Tech/Calisto/Calisto-Module1/chatbot-integrations/src/app/runtime-store.ts)
- [records.ts](/Users/darshan/projects/USIM%20Tech/Calisto/Calisto-Module1/chatbot-integrations/src/app/records.ts)
- [file-json-store.ts](/Users/darshan/projects/USIM%20Tech/Calisto/Calisto-Module1/chatbot-integrations/src/app/file-json-store.ts)
- [create-app.ts](/Users/darshan/projects/USIM%20Tech/Calisto/Calisto-Module1/chatbot-integrations/src/app/create-app.ts)
- [dependencies.ts](/Users/darshan/projects/USIM%20Tech/Calisto/Calisto-Module1/chatbot-integrations/src/app/dependencies.ts)

## Notes

- This storage is file-based for now, not database-backed.
- It is suitable for local development and basic demos.
- For production, move this to a real database and shared dedup store.
