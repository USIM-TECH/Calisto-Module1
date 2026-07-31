# Redis caching

Optional Redis-backed caching for `chatbot-integrations`. When `REDIS_URL` is unset, the app uses in-memory fallbacks so local dev still works without Docker Redis.

## Quick start

```bash
docker compose -f docker-compose.mysql.yml up -d
# .env
REDIS_URL=redis://localhost:6379
npm run dev
```

Check health:

```bash
curl http://localhost:3000/health
# "redis": "ok" | "disabled" | "error"
# "cacheBackend": "redis" | "memory"
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `REDIS_URL` | _(empty)_ | Redis connection URL; omit for in-memory fallback |
| `REDIS_KEY_PREFIX` | `calisto` | Prefix for all cache keys |
| `CACHE_PRODUCT_CATALOGUE_TTL_SEC` | `300` | Product `listAll()` cache |
| `CACHE_KNOWLEDGE_CHUNKS_TTL_SEC` | `600` | Rasa `/knowledge/chunks` cache |
| `CACHE_KNOWLEDGE_SUMMARY_TTL_SEC` | `300` | Admin knowledge summary/documents |
| `CACHE_LEADS_LIST_TTL_SEC` | `60` | `GET /reports/leads` cache |
| `CACHE_TELEGRAM_ALIAS_TTL_SEC` | `86400` | Telegram long callback payloads |

## Cache keys

| Key | Invalidated when |
|-----|------------------|
| `products:catalogue:v1` | Product create/update/delete/CSV import |
| `knowledge:chunks:v1` | Knowledge document create/update/delete |
| `knowledge:summary:v1` | Knowledge document changes |
| `knowledge:documents:v1` | Knowledge document changes |
| `reports:leads:v1` | Webhook messages, webchat, `POST /leads` |
| `tg:cb:{token}` | TTL expiry (Telegram callback aliases) |
| `ratelimit:webchat:{ip}:{senderId}` | TTL window |
| `ig:access_token` | Instagram token refresh |

Full Redis keys are prefixed: `{REDIS_KEY_PREFIX}:{key}`.

## What is not cached

- Webhook deduplication (Postgres `DedupeKey` table)
- Rasa conversation trackers
- NLU parse / LLM classify responses

## Troubleshooting

- **`redis: disabled`** — `REDIS_URL` not set; in-memory fallback active.
- **`redis: error`** — Redis unreachable; restart container: `docker compose -f docker-compose.mysql.yml up -d redis`
- **Stale product/knowledge data** — wait for TTL or restart the integration service after admin writes (writes invalidate cache immediately when Redis/memory backend is shared).
