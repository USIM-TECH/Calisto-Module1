#!/usr/bin/env bash
# One-time (or repeat) copy of app tables from Prisma Cloud / remote Postgres to local.
# Requires cloud access — if your Prisma Cloud plan is blocked, use a prior pg_dump backup instead.
# Usage:
#   export CLOUD_DATABASE_URL='postgres://USER:PASS@db.prisma.io:5432/postgres?sslmode=require'
#   export LOCAL_DATABASE_URL='postgresql://calisto:calisto@localhost:5432/calisto_chatbot'
#   ./scripts/migrate-cloud-to-local.sh

set -euo pipefail

CLOUD_DATABASE_URL="${CLOUD_DATABASE_URL:?Set CLOUD_DATABASE_URL to the remote connection string}"
LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://calisto:calisto@localhost:5432/calisto_chatbot}"

DUMP="/tmp/calisto_data_only.dump"

echo "Dumping data from cloud..."
pg_dump "$CLOUD_DATABASE_URL" --data-only --no-owner --no-acl -Fc \
  -t '"Customer"' \
  -t '"ChannelIdentity"' \
  -t '"Interest"' \
  -t '"CurrentInterest"' \
  -t '"SupportCase"' \
  -t '"Conversation"' \
  -t '"ConversationMessage"' \
  -t '"WebhookEvent"' \
  -t '"DedupeKey"' \
  -t '"Product"' \
  -t '"KnowledgeDocument"' \
  -t '"KnowledgeChunk"' \
  -f "$DUMP"

echo "Truncating local app tables..."
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE TABLE
  "ConversationMessage",
  "Conversation",
  "ChannelIdentity",
  "CurrentInterest",
  "SupportCase",
  "Interest",
  "DedupeKey",
  "WebhookEvent",
  "KnowledgeChunk",
  "KnowledgeDocument",
  "Product",
  "Customer"
CASCADE;
SQL

echo "Restoring into local Postgres..."
pg_restore -d "$LOCAL_DATABASE_URL" --data-only --no-owner --no-acl --disable-triggers "$DUMP" || true

echo "Row counts on local:"
psql "$LOCAL_DATABASE_URL" -c "
SELECT 'Product' t, count(*) FROM \"Product\"
UNION ALL SELECT 'KnowledgeChunk', count(*) FROM \"KnowledgeChunk\"
UNION ALL SELECT 'KnowledgeDocument', count(*) FROM \"KnowledgeDocument\"
UNION ALL SELECT 'Customer', count(*) FROM \"Customer\"
UNION ALL SELECT 'CurrentInterest', count(*) FROM \"CurrentInterest\"
UNION ALL SELECT 'SupportCase', count(*) FROM \"SupportCase\"
UNION ALL SELECT 'ConversationMessage', count(*) FROM \"ConversationMessage\";
"

echo "Done. Open Prisma Studio: npm run db:studio"
