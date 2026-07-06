# Database: MySQL + Prisma tooling

## What stores your data

**MySQL on your machine for local development** or **AWS RDS MySQL for production**. All leads, products, knowledge, and related tables live there.

## What Prisma is in this project (and what it is not)

| Piece | Role |
|-------|------|
| **MySQL** | The actual database — where rows are stored |
| **Prisma ORM** (`@prisma/client`) | TypeScript layer that reads/writes MySQL (used by the app) |
| **Prisma Migrate** | Applies `prisma/migrations/*.sql` to your MySQL instance |
| **Prisma Studio** (`npm run db:studio`) | Browser UI to view/edit MySQL tables |

Prisma is **not** your database server. The app only connects via `DATABASE_URL` to **your** MySQL instance, whether that is local Docker or AWS RDS.

## Migrating from PostgreSQL

If you still have data in a local Postgres database (Docker volume `calisto-postgres-data`):

```bash
./scripts/setup-local-mysql.sh --import-postgres
```

This starts a temporary Postgres container, copies all rows into MySQL, then stops Postgres again.

Or manually:

```bash
docker compose -f docker-compose.postgres-import.yml up -d
export POSTGRES_DATABASE_URL='postgresql://calisto:calisto@127.0.0.1:5432/calisto_chatbot'
export LOCAL_DATABASE_URL='mysql://calisto:calisto@localhost:3306/calisto_chatbot'
./scripts/migrate-postgres-to-mysql.sh
docker compose -f docker-compose.postgres-import.yml down
```

For production, set `DATABASE_URL` to your client's MySQL server (RDS, Azure Database, on-prem, etc.) and run `npm run db:migrate`.

Optional Redis caching (products, knowledge, leads, Telegram aliases): see [CACHING.md](../CACHING.md).

## Quick start

From `chatbot-integrations/`:

```bash
./scripts/setup-local-mysql.sh
npm run db:studio    # http://localhost:5555
npm run dev
```

`.env`:

```env
STORAGE_BACKEND=mysql
DATABASE_URL=mysql://calisto:calisto@localhost:3306/calisto_chatbot
REDIS_URL=redis://localhost:6379
```

Legacy `STORAGE_BACKEND=postgres` is still accepted and mapped to `mysql`.

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
