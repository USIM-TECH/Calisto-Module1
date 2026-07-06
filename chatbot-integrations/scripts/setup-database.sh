#!/usr/bin/env bash
# setup-database.sh — bootstrap MySQL (and optional Redis) for chatbot-integrations.
#
# Use this on a new machine or after pulling an older copy of the repo. It:
#   1. Starts local MySQL + Redis via Docker (unless --no-docker)
#   2. Runs `prisma generate` + `prisma migrate deploy` (single baseline migration)
#   3. Rebases migration history when the DB already has tables from an older
#      incremental migration chain (no data loss)
#
# Usage (from chatbot-integrations/):
#   ./scripts/setup-database.sh
#   ./scripts/setup-database.sh --fresh              # wipe Docker MySQL volume and recreate
#   ./scripts/setup-database.sh --seed-presets       # also seed merchandising presets
#   ./scripts/setup-database.sh --import-postgres    # one-time copy from local Postgres
#   ./scripts/setup-database.sh --no-docker          # only migrate (external MySQL)
#
# Requires: Docker (unless --no-docker), Node/npm, curl.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASELINE_MIGRATION="20260701000000_baseline"
LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-mysql://calisto:calisto@localhost:3306/calisto_chatbot}"
LOCAL_REDIS_URL="${LOCAL_REDIS_URL:-redis://localhost:6379}"

FRESH=0
NO_DOCKER=0
IMPORT_POSTGRES=0
SEED_PRESETS=0

for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=1 ;;
    --no-docker) NO_DOCKER=1 ;;
    --import-postgres) IMPORT_POSTGRES=1 ;;
    --seed-presets) SEED_PRESETS=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

log()  { printf '\n\033[1;34m>>> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    WARN: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# Load DATABASE_URL from .env when present (dotenv-style, no export of secrets elsewhere).
if [[ -f "$ROOT/.env" ]]; then
  env_url="$(grep -E '^DATABASE_URL=' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)"
  [[ -n "$env_url" ]] && LOCAL_DATABASE_URL="$env_url"
fi
export DATABASE_URL="$LOCAL_DATABASE_URL"

mysql_table_exists() {
  local table="$1"
  docker exec calisto-mysql mysql -u calisto -pcalisto -N -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='calisto_chatbot' AND table_name='${table}';" \
    2>/dev/null | grep -q '^1$'
}

schema_has_core_tables() {
  # Prefer the local Docker MySQL container when it is running (even with --no-docker).
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'calisto-mysql'; then
    mysql_table_exists "Customer"
    return
  fi
  # External MySQL: use the mysql CLI when available.
  if command -v mysql >/dev/null 2>&1; then
    local url="${DATABASE_URL#mysql://}"
    local userpass="${url%%@*}"
    local hostdb="${url#*@}"
    local user="${userpass%%:*}"
    local pass="${userpass#*:}"
    local host="${hostdb%%/*}"
    local hostonly="${host%%:*}"
    local port="${host#*:}"; [[ "$port" == "$host" ]] && port=3306
    local db="${hostdb#*/}"; db="${db%%\?*}"
    mysql -h "$hostonly" -P "$port" -u "$user" -p"$pass" -N -e \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${db}' AND table_name='Customer';" \
      2>/dev/null | grep -q '^1$'
    return
  fi
  return 1
}

clear_prisma_migrations_table() {
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'calisto-mysql'; then
    docker exec calisto-mysql mysql -u calisto -pcalisto calisto_chatbot -e \
      "DELETE FROM _prisma_migrations;" 2>/dev/null || true
    return
  fi
  if command -v mysql >/dev/null 2>&1; then
    local url="${DATABASE_URL#mysql://}"
    local userpass="${url%%@*}"
    local hostdb="${url#*@}"
    local user="${userpass%%:*}"
    local pass="${userpass#*:}"
    local host="${hostdb%%/*}"
    local hostonly="${host%%:*}"
    local port="${host#*:}"; [[ "$port" == "$host" ]] && port=3306
    local db="${hostdb#*/}"; db="${db%%\?*}"
    mysql -h "$hostonly" -P "$port" -u "$user" -p"$pass" "$db" -e \
      "DELETE FROM _prisma_migrations;" 2>/dev/null || true
  fi
}

rebase_migration_history() {
  info "Rebasing _prisma_migrations to baseline ($BASELINE_MIGRATION)..."
  clear_prisma_migrations_table
  npx prisma migrate resolve --applied "$BASELINE_MIGRATION"
  ok "Migration history rebased (schema unchanged, data kept)"
}

apply_migrations() {
  log "Applying Prisma migrations..."
  local out
  if out="$(npx prisma migrate deploy 2>&1)"; then
    printf '%s\n' "$out"
    ok "Migrations applied"
    return 0
  fi
  printf '%s\n' "$out" >&2

  # Existing DB from an older incremental migration chain (or a failed baseline
  # attempt): tables exist but migration history no longer matches the repo.
  if schema_has_core_tables; then
    warn "migrate deploy failed but core tables exist — rebasing migration history"
    rebase_migration_history
    return 0
  fi

  die "prisma migrate deploy failed (see output above)"
}

# ---- Docker ----------------------------------------------------------------
if [[ "$NO_DOCKER" == "0" ]]; then
  command -v docker >/dev/null 2>&1 || die "docker not found (use --no-docker if MySQL runs elsewhere)"

  if [[ "$FRESH" == "1" ]]; then
    log "Resetting local MySQL volume (--fresh)..."
    docker compose -f docker-compose.mysql.yml down -v
  fi

  log "Starting MySQL + Redis (Docker)..."
  docker compose -f docker-compose.mysql.yml up -d

  info "Waiting for MySQL..."
  for _ in $(seq 1 60); do
    if docker exec calisto-mysql mysqladmin ping -h localhost -u calisto -pcalisto --silent >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  docker exec calisto-mysql mysqladmin ping -h localhost -u calisto -pcalisto --silent >/dev/null 2>&1 \
    || die "MySQL did not become ready — check: docker compose -f docker-compose.mysql.yml logs mysql"

  info "Waiting for Redis..."
  for _ in $(seq 1 30); do
    if docker exec calisto-redis redis-cli ping >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  ok "MySQL + Redis are up"
fi

# ---- Node / Prisma ---------------------------------------------------------
command -v npm >/dev/null 2>&1 || die "npm not found"
if [[ ! -d node_modules ]]; then
  log "Installing npm dependencies..."
  npm install
fi

log "Generating Prisma client..."
npm run db:generate
ok "Prisma client generated"

apply_migrations

# ---- Optional Postgres import ----------------------------------------------
if [[ "$IMPORT_POSTGRES" == "1" ]]; then
  POSTGRES_DATABASE_URL="${POSTGRES_DATABASE_URL:-postgresql://calisto:calisto@127.0.0.1:5432/calisto_chatbot}"
  log "Importing data from PostgreSQL (one-time)..."
  docker compose -f docker-compose.postgres-import.yml up -d
  for _ in $(seq 1 60); do
    if docker exec calisto-postgres-import pg_isready -U calisto -d calisto_chatbot >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  POSTGRES_DATABASE_URL="$POSTGRES_DATABASE_URL" LOCAL_DATABASE_URL="$LOCAL_DATABASE_URL" \
    ./scripts/migrate-postgres-to-mysql.sh
  docker compose -f docker-compose.postgres-import.yml down
  ok "Postgres import finished"
fi

# ---- Optional seeds --------------------------------------------------------
if [[ "$SEED_PRESETS" == "1" ]]; then
  log "Seeding merchandising presets..."
  npm run db:seed:presets
  ok "Presets seeded"
fi

# ---- Summary ---------------------------------------------------------------
log "Database setup complete."
echo ""
info "Set in .env (if not already):"
info "  STORAGE_BACKEND=mysql"
info "  DATABASE_URL=$LOCAL_DATABASE_URL"
info "  REDIS_URL=$LOCAL_REDIS_URL"
echo ""
if [[ "$NO_DOCKER" == "0" ]]; then
  info "Row counts:"
  docker exec calisto-mysql mysql -u calisto -pcalisto calisto_chatbot -e "
SELECT 'Product' AS t, COUNT(*) AS c FROM Product
UNION ALL SELECT 'Preset', COUNT(*) FROM Preset
UNION ALL SELECT 'KnowledgeChunk', COUNT(*) FROM KnowledgeChunk
UNION ALL SELECT 'Customer', COUNT(*) FROM Customer;
" 2>/dev/null || warn "Could not query row counts"
fi
echo ""
info "Browse data:  npm run db:studio"
info "Seed products: npm run db:seed:products  (requires KB_CATALOGUE_PATH in .env)"
info "Seed presets:  npm run db:seed:presets"
