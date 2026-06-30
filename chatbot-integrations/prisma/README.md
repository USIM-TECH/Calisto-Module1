# Database: local MySQL + Prisma tooling

## What stores your data

**MySQL on your machine** (Docker or native install). All leads, products, knowledge, and related tables live there.

## What Prisma is in this project (and what it is not)

| Piece | Role |
|-------|------|
| **MySQL** | The actual database — where rows are stored |
| **Prisma ORM** (`@prisma/client`) | TypeScript layer that reads/writes MySQL (used by the app) |
| **Prisma Migrate** | Applies `prisma/migrations/*.sql` to your local MySQL |
| **Prisma Studio** (`npm run db:studio`) | Browser UI to view/edit local MySQL tables |

Prisma is **not** your database server. The app only connects via `DATABASE_URL` to **your** MySQL instance.

## Migrating from PostgreSQL

If you still have data in a local Postgres database (Docker volume `calisto-postgres-data`):

```bash
./scripts/setup-database.sh --import-postgres
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

## Quick start (new machine)

From `chatbot-integrations/`:

```bash
./scripts/setup-database.sh          # MySQL + Redis + Prisma baseline migration
./scripts/setup-database.sh --seed-presets   # optional: default merchandising presets
npm run db:studio    # http://localhost:5555
npm run dev
```

On a machine that already ran older incremental migrations, `setup-database.sh` **rebases** `_prisma_migrations` to the single baseline without dropping data.

### Migration layout

All schema is in **one** Prisma migration: `prisma/migrations/20260701000000_baseline/`. Older incremental folders were squashed so new clones only need `prisma migrate deploy` (or `npm run db:setup`).

| Flag | Purpose |
|------|---------|
| `--fresh` | Wipe Docker MySQL volume and recreate (destroys local data) |
| `--no-docker` | Skip Docker; only `prisma generate` + migrate (external MySQL) |
| `--import-postgres` | One-time row copy from local Postgres |
| `--seed-presets` | Run `npm run db:seed:presets` after migrate |

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
| `npm run db:setup` | Full local DB bootstrap (Docker + migrate + optional flags) |
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
