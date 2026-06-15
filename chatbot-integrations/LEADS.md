# Lead Capture & Customer Identity

This document explains how the integration service captures leads, deduplicates them across channels, persists conversation context, and syncs qualified records to HubSpot.

## Conceptual model

We track three primary entities:

| Entity | One row per | Purpose |
|---|---|---|
| **Customer** | real person | Canonical name / email / phone / location / preferred service / qualification status |
| **ChannelIdentity** | (channel, sourceId) tuple | A way the customer reaches us — WhatsApp phone, Telegram user id, IG IGSID, etc. A single customer can own many identities. |
| **Interest** | (customer, kind, value) | Append-only history of every product/brand/lens-type/budget/use-case the bot picks up. |

Conversations and webhook events hang off `Customer` (and reference the originating `ChannelIdentity` so each channel's transcript stays distinct).

## Identity per channel

| Channel | Stable `sourceId` | Captured `username` | Notes |
|---|---|---|---|
| WhatsApp | E.164 phone | — | Phone is also auto-populated as the customer phone for any WhatsApp identity. |
| Telegram | numeric `from.id` | `@username` (if set) | username is optional and changeable, never used for dedup. |
| Instagram | IGSID (`item.sender.id`) | IG handle from Graph profile | username is fetched lazily once per session. |
| Messenger | PSID | — | PSID is page-scoped and stable. |
| X | numeric user id | screen_name | |
| Website | per-request id (`website-${ts}`) | — | No native identity; rely on phone/email merge after the lead form. See **Webchat caveat** below. |

## Lookup & merge flow

When a message arrives:

1. **`resolveIdentity(channel, sourceId)`**
   - Hit → reuse the existing `ChannelIdentity` and its `Customer`.
   - Miss → create a new `ChannelIdentity` and a fresh `Customer`.
2. Apply any channel-payload contact info (WhatsApp profile name, Telegram contact card, etc.) to the customer if those fields are still empty.
3. Forward the user's text to Rasa, **passing the customer's known fields as `metadata`** so Rasa's `action_prefill_lead_capture` skips lead-capture-form questions for fields we already have on file.
4. Read Rasa's tracker. If new `phone`, `email`, or other lead fields appear, write them onto the customer.
5. **Merge step**: whenever `phone` or `email` is freshly set on a customer, look for any other customer that already owns the same phone or email (normalised). If one exists, merge:
   - Re-point all `ChannelIdentity`, `Conversation`, `Interest`, and `WebhookEvent` rows from the loser to the survivor.
   - Combine field values, preferring the survivor's existing values and falling back to the loser's.
   - Delete the loser.
6. Append every interest the tracker yields (`product_type`, `brand`, `lens_type`, `use_case`, `budget`, `urgency`, `preferred_service`) into the `Interest` table. Duplicates are silently skipped via the `(customerId, kind, value)` unique constraint.
7. If the customer is now `qualified`, sync to HubSpot.

## Skip-already-collected questions

The Rasa side (`actions.py::ActionPrefillLeadCapture`) reads the integration's metadata and `SlotSet`s `lead_name`, `contact_number`, `email`, `lead_location`, and `preferred_service` for any field that is non-empty in metadata. The form only asks for slots that are still null — so a returning customer with name + phone + email already on file will only be asked for the missing ones (e.g. location, urgency).

The integration assembles that metadata with this priority:

1. The customer record (the most trusted source of truth).
2. The current channel identity's `senderName` / `username`.
3. Channel-payload fallbacks (WhatsApp profile, Telegram contact card).

## Webchat caveat

Webchat does not have a native stable identity. By design we currently:

- Mint a session id per request when the widget doesn't supply one.
- Identify the customer purely via phone / email once the lead capture form completes — at which point the merge step folds the anonymous webchat session into any pre-existing customer record on another channel.

If you need durable webchat identity, the embedded widget should persist a UUID in `localStorage` and pass it as `senderId` on every `/webchat/message` call. Then this UUID becomes the `sourceId` of a stable `ChannelIdentity`.

## Stored data

Persistence happens through a `RuntimeStore` implementation:

| Mode | Configuration | Location |
|---|---|---|
| **Local PostgreSQL (default)** | `STORAGE_BACKEND=postgres` and `DATABASE_URL` | Tables via [Prisma ORM](prisma/schema.prisma); browse with `npm run db:studio` |
| **File (fallback / opt-in)** | `STORAGE_BACKEND=file`, or postgres requested without `DATABASE_URL` | `data/runtime/runtime-store.json` |

Both backends honour the same `RuntimeStore` interface and produce identical record shapes (`CustomerRecord`, `ChannelIdentityRecord`, `InterestRecord`, `ConversationRecord`, `ConversationMessageRecord`, `WebhookEventRecord`).

### Retention (PostgreSQL)

- **Webhook events**: kept to the most recent 999 rows (older are pruned on insert).
- **Dedupe keys**: rows older than `DEDUP_TTL_MS` are GC'd on the next dedupe check.

### Migration / fresh start

Run:

```bash
DATABASE_URL=... npx prisma migrate reset --force
DATABASE_URL=... npx prisma migrate dev --name customer_identity_model
```

The `reset` is a destructive wipe — only use it on dev databases.

## Reporting endpoints

| Path | Returns |
|---|---|
| `GET /reports/overview` | aggregate counts (customers, qualified, pendingSync, conversations, identities, channels) |
| `GET /reports/leads` | `{ customers, summary, services }` JSON |
| `GET /reports/leads-dashboard` | HTML dashboard, customer cards |
| `GET /reports/leads-dashboard/:customerId` | HTML detail view: profile, channel identities, captured interests, transcript |

## CRM sync

If `HUBSPOT_ACCESS_TOKEN` is configured, customers whose `qualificationStatus` becomes `qualified` are pushed to HubSpot:

1. search HubSpot contact by email/phone
2. create or update the contact with the customer's profile properties
3. create a HubSpot lead record linked to the contact
4. mark the local customer as `synced` (or `failed` on error)

## Important files

- [src/leads/orchestration/lead-orchestrator.ts](src/leads/orchestration/lead-orchestrator.ts) — the per-message flow described above
- [src/leads/storage/runtime-store.interface.ts](src/leads/storage/runtime-store.interface.ts)
- [src/leads/storage/prisma-runtime-store.ts](src/leads/storage/prisma-runtime-store.ts)
- [src/leads/storage/file-runtime-store.ts](src/leads/storage/file-runtime-store.ts)
- [src/leads/storage/helpers.ts](src/leads/storage/helpers.ts) — phone/email normalisation used as merge keys
- [src/leads/types/records.ts](src/leads/types/records.ts)
- [prisma/schema.prisma](prisma/schema.prisma)
- [../chatbot-frontend/src/pages/LeadsPage.tsx](../chatbot-frontend/src/pages/LeadsPage.tsx) — React leads UI (consumes `/reports/leads` + `/reports/leads/:id`)
- [calisto_nlp_export/actions/actions.py](../calisto_nlp_export/actions/actions.py) — `ActionPrefillLeadCapture` consumes the metadata
