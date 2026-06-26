#!/usr/bin/env bash
# Bootstrap local MySQL + Redis for chatbot-integrations.
#
# Usage (from chatbot-integrations/):
#   ./scripts/setup-local-mysql.sh
#   ./scripts/setup-local-mysql.sh --import-postgres   # optional one-time data copy from local Postgres
#
# Requires: Docker, Node/npm; mysql client for row counts; migrate-postgres-to-mysql.sh for --import-postgres

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-mysql://calisto:calisto@localhost:3306/calisto_chatbot}"
LOCAL_REDIS_URL="${LOCAL_REDIS_URL:-redis://localhost:6379}"

echo "Starting local MySQL and Redis..."
docker compose -f docker-compose.mysql.yml up -d

echo "Waiting for MySQL..."
for _ in $(seq 1 60); do
  if docker exec calisto-mysql mysqladmin ping -h localhost -u calisto -pcalisto --silent >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Waiting for Redis..."
for _ in $(seq 1 30); do
  if redis-cli -h localhost -p 6379 ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Applying Prisma migrations..."
DATABASE_URL="$LOCAL_DATABASE_URL" npm run db:migrate

if [[ "${1:-}" == "--import-postgres" ]]; then
  POSTGRES_DATABASE_URL="${POSTGRES_DATABASE_URL:-postgresql://calisto:calisto@127.0.0.1:5432/calisto_chatbot}"
  echo "Starting temporary PostgreSQL for data import..."
  docker compose -f docker-compose.postgres-import.yml up -d

  echo "Waiting for PostgreSQL..."
  for _ in $(seq 1 60); do
    if docker exec calisto-postgres-import pg_isready -U calisto -d calisto_chatbot >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! docker exec calisto-postgres-import pg_isready -U calisto -d calisto_chatbot >/dev/null 2>&1; then
    echo "PostgreSQL did not become ready. Check: docker compose -f docker-compose.postgres-import.yml logs"
    exit 1
  fi

  echo "Importing data from PostgreSQL..."
  POSTGRES_DATABASE_URL="$POSTGRES_DATABASE_URL" LOCAL_DATABASE_URL="$LOCAL_DATABASE_URL" ./scripts/migrate-postgres-to-mysql.sh

  echo "Stopping temporary PostgreSQL..."
  docker compose -f docker-compose.postgres-import.yml down
fi

echo ""
echo "Local MySQL and Redis are ready."
echo "Set in .env:"
echo "  STORAGE_BACKEND=mysql"
echo "  DATABASE_URL=$LOCAL_DATABASE_URL"
echo "  REDIS_URL=$LOCAL_REDIS_URL"
echo ""
echo "See CACHING.md for cache keys and TTLs."
echo "Row counts:"
docker exec calisto-mysql mysql -u calisto -pcalisto calisto_chatbot -e "
SELECT 'Product' AS t, COUNT(*) AS c FROM Product
UNION ALL SELECT 'KnowledgeChunk', COUNT(*) FROM KnowledgeChunk
UNION ALL SELECT 'Customer', COUNT(*) FROM Customer;
"
echo ""
echo "Browse data: npm run db:studio"
