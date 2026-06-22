#!/usr/bin/env bash
# Bootstrap local PostgreSQL for chatbot-integrations (Prisma ORM, not Prisma Cloud).
#
# Usage (from chatbot-integrations/):
#   ./scripts/setup-local-postgres.sh
#   ./scripts/setup-local-postgres.sh --import-cloud   # optional one-time data copy
#
# Requires: Docker, Node/npm, psql/pg_dump/pg_restore for --import-cloud

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://calisto:calisto@localhost:5432/calisto_chatbot}"

echo "Starting local PostgreSQL..."
docker compose -f docker-compose.postgres.yml up -d

echo "Waiting for Postgres..."
for _ in $(seq 1 30); do
  if pg_isready -h localhost -p 5432 -U calisto -d calisto_chatbot >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Applying Prisma migrations..."
DATABASE_URL="$LOCAL_DATABASE_URL" npm run db:migrate

if [[ "${1:-}" == "--import-cloud" ]]; then
  if [[ -z "${CLOUD_DATABASE_URL:-}" ]]; then
    if [[ -f .env ]]; then
      # shellcheck disable=SC1091
      set -a && source .env && set +a
      if [[ "${DATABASE_URL:-}" == *db.prisma.io* ]]; then
        CLOUD_DATABASE_URL="$DATABASE_URL"
      fi
    fi
  fi

  if [[ -z "${CLOUD_DATABASE_URL:-}" ]]; then
    echo "Set CLOUD_DATABASE_URL to import from Prisma Cloud, e.g.:"
    echo "  export CLOUD_DATABASE_URL='postgres://...@db.prisma.io:5432/postgres?sslmode=require'"
    echo "  ./scripts/migrate-cloud-to-local.sh"
    exit 1
  fi

  echo "Importing data from cloud..."
  CLOUD_DATABASE_URL="$CLOUD_DATABASE_URL" LOCAL_DATABASE_URL="$LOCAL_DATABASE_URL" ./scripts/migrate-cloud-to-local.sh
fi

echo ""
echo "Local Postgres is ready."
echo "Set in .env:"
echo "  STORAGE_BACKEND=postgres"
echo "  DATABASE_URL=$LOCAL_DATABASE_URL"
echo ""
echo "Row counts:"
psql "$LOCAL_DATABASE_URL" -c "
SELECT 'Product' t, count(*) FROM \"Product\"
UNION ALL SELECT 'KnowledgeChunk', count(*) FROM \"KnowledgeChunk\"
UNION ALL SELECT 'Customer', count(*) FROM \"Customer\";
"
echo ""
echo "Browse data: npm run db:studio"
