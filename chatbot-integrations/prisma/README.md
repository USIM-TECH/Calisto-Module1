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
