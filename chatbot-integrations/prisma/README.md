# Database: local PostgreSQL + Prisma tooling

## What stores your data

**PostgreSQL on your machine** (Docker or native install). All leads, products, knowledge, and related tables live there.

## What Prisma is in this project (and what it is not)

| Piece | Role |
|-------|------|
| **PostgreSQL** | The actual database — where rows are stored |
| **Prisma ORM** (`@prisma/client`) | TypeScript layer that reads/writes Postgres (used by the app) |
| **Prisma Migrate** | Applies `prisma/migrations/*.sql` to your local Postgres |
| **Prisma Studio** (`npm run db:studio`) | Browser UI to view/edit local Postgres tables |

Prisma is **not** your database server. There is no Prisma Cloud / `db.prisma.io` connection in this repo. The app only connects via `DATABASE_URL` to **local** Postgres.

## Migrating from Prisma Cloud

Prisma Cloud (`db.prisma.io`) is hosted PostgreSQL billed through Prisma. This project uses **Prisma ORM** against **your own PostgreSQL** — you are not tied to Prisma Cloud.

1. Start local Postgres: `./scripts/setup-local-postgres.sh`
2. If cloud access still works, copy data once:
   ```bash
   export CLOUD_DATABASE_URL='postgres://...@db.prisma.io:5432/postgres?sslmode=require'
   ./scripts/migrate-cloud-to-local.sh
   ```
3. Point `.env` at local Postgres:
   ```env
   DATABASE_URL=postgresql://calisto:calisto@localhost:5432/calisto_chatbot
   ```

For production, set `DATABASE_URL` to your client's PostgreSQL server (RDS, Azure Database, on-prem, etc.) and run `npm run db:migrate`.

Optional Redis caching (products, knowledge, leads, Telegram aliases): see [CACHING.md](../CACHING.md).

## Quick start

From `chatbot-integrations/`:

```bash
docker compose -f docker-compose.postgres.yml up -d
npm run db:migrate:dev
npm run db:studio    # http://localhost:5555
npm run dev
```

`.env`:

```env
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://calisto:calisto@localhost:5432/calisto_chatbot
REDIS_URL=redis://localhost:6379
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run db:migrate:dev` | Dev migrations |
| `npm run db:migrate` | Production deploy |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset:dev` | Reset DB and re-apply migrations |
| `npm run db:seed:products` | Seed products from CSV |
| `npm run db:seed:knowledge` | Seed knowledge from meta JSON |

## Retention

- **WebhookEvent**: capped at 999 rows (by `receivedAt`).
- **DedupeKey**: entries older than `DEDUP_TTL_MS` are pruned on check.
