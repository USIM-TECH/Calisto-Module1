# Prisma (PostgreSQL)

Runtime data for leads, conversations, webhook audit logs, and deduplication is stored in **PostgreSQL by default**. JSON file storage (`data/runtime/runtime-store.json`) is optional via `STORAGE_BACKEND=file` or as a fallback when `DATABASE_URL` is missing.

## Setup

1. Create a database and set in `.env`:

   - `DATABASE_URL` — PostgreSQL connection string, e.g. `postgresql://USER:PASSWORD@localhost:5432/calisto_chatbot`
   - `STORAGE_BACKEND` — defaults to `postgres`; omit or set explicitly

2. Apply migrations:

   ```bash
   npm run db:migrate:dev   # development (creates migration if schema changed)
   # or
   npm run db:migrate       # production: prisma migrate deploy
   ```

3. Generate the client (also runs on `npm install` via `postinstall`):

   ```bash
   npm run db:generate
   ```

## Optional: import existing JSON

If you have `data/runtime/runtime-store.json` from the file backend:

```bash
npm run db:import-json
```

Requires `DATABASE_URL` set. Run against an empty database or expect unique conflicts on re-run.

## Retention

- **WebhookEvent**: After each insert, rows beyond the latest **999** (by `receivedAt`) are deleted, matching the previous file-store behaviour.
- **DedupeKey**: Entries older than `DEDUP_TTL_MS` are removed when checking deduplication.
