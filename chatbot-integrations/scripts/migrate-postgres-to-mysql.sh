#!/usr/bin/env bash
# Copy application data from a local PostgreSQL database into MySQL.
#
# Usage (from chatbot-integrations/):
#   export POSTGRES_DATABASE_URL='postgresql://calisto:calisto@localhost:5432/calisto_chatbot'
#   export LOCAL_DATABASE_URL='mysql://calisto:calisto@localhost:3306/calisto_chatbot'
#   ./scripts/migrate-postgres-to-mysql.sh
#
# Requires: Node/npm, tsx, running Postgres source and migrated MySQL target.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

POSTGRES_DATABASE_URL="${POSTGRES_DATABASE_URL:-postgresql://calisto:calisto@127.0.0.1:5432/calisto_chatbot}"
LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-mysql://calisto:calisto@localhost:3306/calisto_chatbot}"

if [[ -z "${POSTGRES_DATABASE_URL}" || -z "${LOCAL_DATABASE_URL}" ]]; then
  echo "Set POSTGRES_DATABASE_URL and LOCAL_DATABASE_URL."
  exit 1
fi

echo "Exporting from Postgres and importing into MySQL via Prisma..."
POSTGRES_DATABASE_URL="$POSTGRES_DATABASE_URL" LOCAL_DATABASE_URL="$LOCAL_DATABASE_URL" npx tsx scripts/migrate-postgres-to-mysql.ts

echo "Done. Verify with: npm run db:studio"
