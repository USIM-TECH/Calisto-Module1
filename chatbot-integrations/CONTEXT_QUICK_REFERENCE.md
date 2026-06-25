# Context-Aware Query Expansion - Quick Reference

## What It Does

Resolves contextual references like "that", "this", "it" without calling the LLM by using lightweight Redis session memory.

## Flow

```
User: "show raymond glasses"
→ Rasa extracts: { brand: "Raymond", product: "glasses" }
→ Redis stores session context
→ Response sent

User: "show that"
→ Context detected: simple_reference
→ Redis fetched: { brand: "Raymond", product: "glasses" }
→ Expanded: "show raymond glasses"
→ Sent to Rasa
→ Response sent
```

## Supported References

| Type | Examples | Expansion |
|------|----------|-----------|
| Simple | that, this, it, same one, previous one | → stored brand + product |
| Modification | blue ones, cheaper ones, similar ones | → modifier + stored context |
| Accessory | lenses for that, case for it | → accessory + stored product |

## Not Expanded (Routes to NLP)

- Comparisons: "compare that with titan"
- Complex reasoning: "which is best for office?"
- Regular queries: "show rayban glasses"

## Redis Storage

**Key pattern:** `calisto:session:context:{session_id}`

**TTL:** 30 minutes

**Structure:**
```json
{
  "session_id": "whatsapp:123456789",
  "current_interest": {
    "brand": "Raymond",
    "product": "Designer Frames",
    "color": "black",
    "material": "metal"
  },
  "last_query": "show black metal raymond frames",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

## Context Updates

Automatically updated when Rasa extracts:
- `brand` (from slot)
- `product_type` (from slot)
- `frame_color`, `frame_material`, `frame_shape`, `gender` (from slots)
- `budget_min`, `budget_max` (combined into price_range)

**Latest extraction always overwrites.**

## Code Structure

```
chatbot-integrations/src/core/context/
├── context-types.ts        # TypeScript interfaces
├── context-detector.ts     # Pattern matching logic
├── session-memory.ts       # Redis storage manager
├── query-expander.ts       # Main expansion logic
├── index.ts                # Exports
└── test-examples.ts        # Demo/test cases
```

## Integration Point

In `nlp-client.ts` before Rasa processing:

```typescript
// Context expansion happens here
if (this._queryExpander && !safeMessage.startsWith('/')) {
  const expansion = await this._queryExpander.expand(safeSender, safeMessage)
  if (expansion.expanded && expansion.expanded_query) {
    safeMessage = expansion.expanded_query
  }
}

// Then sent to Rasa
await axios.post(`${rasaUrl}/webhooks/rest/webhook`, ...)
```

## Logging

Watch for these logs:

```
[Context] Query expansion applied: "show that" → "show raymond glasses"
[Context] Updated session user_123: {"brand":"Raymond","product":"glasses"}
[Context] No session context found for user_456
```

## Testing

### Manual Test (via API)

```bash
# First message - stores context
curl -X POST http://localhost:3000/webchat/message \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_user",
    "message": "show raymond glasses",
    "sessionId": "test_session"
  }'

# Check Redis
redis-cli
> GET calisto:session:context:test_session

# Second message - uses context
curl -X POST http://localhost:3000/webchat/message \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_user",
    "message": "show that",
    "sessionId": "test_session"
  }'

# Logs should show expansion
```

### Run Test Examples

```bash
cd chatbot-integrations
npx tsx src/core/context/test-examples.ts
```

## Performance

- **Redis read/write:** ~1-2ms
- **Pattern matching:** <1ms
- **Total overhead:** ~2-3ms per query
- **LLM calls saved:** 100% for simple references
- **Net latency reduction:** 100-500ms (vs LLM)

## Disabling

The feature auto-activates when Redis is available. To disable:

1. Remove `REDIS_URL` from `.env` (falls back to in-memory cache)
2. Context expansion won't initialize

## Troubleshooting

**Context not expanding:**
- Check Redis is running: `redis-cli ping`
- Check logs for `[Context]` messages
- Verify session has context: `redis-cli GET calisto:session:context:{id}`

**Context not updating:**
- Check Rasa is extracting entities correctly
- Look for entity names in tracker slots
- Verify slot names match expected names (brand, product_type, etc.)

**Wrong context used:**
- Session TTL expired (30 min)
- Different session ID (channel changes)
- Context overwritten by newer query

## Examples

### Conversation 1: Simple References

```
User: "show gucci sunglasses"
Bot: [shows products]
Context: { brand: "Gucci", product: "Luxury Sunglasses" }

User: "show that"
Expanded: "show gucci luxury sunglasses"
Bot: [shows same products]

User: "more options"
Expanded: "show gucci luxury sunglasses more options"
Bot: [shows alternatives]
```

### Conversation 2: Modifications

```
User: "show rayban frames"
Bot: [shows frames]
Context: { brand: "RayBan", product: "Designer Frames" }

User: "show blue ones"
Expanded: "show blue rayban designer frames"
Bot: [shows blue rayban frames]

User: "cheaper ones"
Expanded: "show cheaper rayban designer frames"
Bot: [shows budget rayban frames]
```

### Conversation 3: Accessories

```
User: "show oakley sports glasses"
Bot: [shows products]
Context: { brand: "Oakley", product: "Designer Frames", category: "sports" }

User: "lenses for that"
Expanded: "lenses for oakley designer frames"
Bot: [shows compatible lenses]

User: "case for it"
Expanded: "case for oakley designer frames"
Bot: [shows cases]
```

## Key Decisions

✅ **Deterministic over Generative** - Pattern matching, not AI  
✅ **Lightweight Storage** - Current interest only, not full history  
✅ **Non-Invasive** - Works alongside existing Rasa/LLM logic  
✅ **Latest Wins** - New entities overwrite old context  
✅ **Session-Based** - TTL expires after 30 minutes  

## Metrics to Monitor

- `context_expansion_rate`: % of queries expanded
- `context_hit_rate`: % of contextual queries with valid session
- `llm_calls_saved`: Count of simple references handled
- `expansion_latency`: Time spent in expansion layer
- `context_accuracy`: User corrections after expansion
