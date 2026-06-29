# Context-Aware Query Expansion

## Overview

A lightweight context detection and query expansion layer that resolves contextual references (like "that", "this", "it") without invoking the LLM, reducing latency and costs while improving conversational continuity.

## Architecture

```
User Query
    ↓
Context Detection Layer (NEW)
    ↓
Redis Session Memory (NEW)
    ↓
Query Expansion (NEW)
    ↓
Rasa NLP
    ↓
Intent + Entity Extraction
    ↓
Search Engine
    ↓
Response
```

## How It Works

### 1. Context Detection

The system identifies contextual references in user queries:

**Simple References (single words):**
- that, this, it, them, those, these
- earlier, previous, same

**Phrase References:**
- that one, this one, same one
- the previous one, the earlier one
- the product above, the one you showed
- that product, same brand

**Product Modifications:**
- Color: blue, black, brown, silver, gold, etc.
- Quality: cheaper, premium, expensive, better, luxury
- Variety: similar, alternatives, more options

**Accessories:**
- lenses for that
- case for that
- cleaning kit for that
- accessories for that

### 2. Session Memory (Redis)

Stores lightweight user context per session (30-minute TTL):

```json
{
  "session_id": "user_123",
  "current_interest": {
    "brand": "Raymond",
    "product": "glasses",
    "color": "black",
    "material": "metal",
    "shape": "round"
  },
  "last_query": "show raymond glasses",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### 3. Query Expansion

When a contextual reference is detected, the system:

1. Fetches session context from Redis
2. Expands the query using stored context
3. Sends the expanded query to Rasa

**Example:**

```
User: "show raymond glasses"
→ Redis: { brand: "Raymond", product: "glasses" }
→ Rasa: processes normally

User: "show that"
→ Detect: simple_reference
→ Expand: "show raymond glasses"
→ Rasa: receives expanded query

User: "show blue ones"
→ Detect: product_modification (color: blue)
→ Expand: "show blue raymond glasses"
→ Rasa: receives expanded query

User: "lenses for that"
→ Detect: accessory (type: lenses)
→ Expand: "lenses for raymond glasses"
→ Rasa: receives expanded query
```

### 4. Context Updates

After Rasa extracts entities, the session context is updated automatically:

**Tracked Entities:**
- `brand` → from slot `brand`
- `product` → from slot `product_type`
- `color` → from slot `frame_color`
- `material` → from slot `frame_material`
- `shape` → from slot `frame_shape`
- `gender` → from slot `gender`
- `price_range` → from slots `budget_min`, `budget_max`

Latest entity extraction always overwrites previous context.

## Supported Use Cases

### ✅ Handled by Context Expansion

**Simple References:**
```
show that
show this
show it
show those
show the same one
show the previous one
```
→ Expands to stored brand/product

**Product Modifications:**
```
show blue ones
show cheaper ones
show premium ones
show similar ones
show more options
```
→ Expands with modifier + stored context

**Accessories:**
```
lenses for that
case for it
cleaning kit for those
```
→ Expands to accessory for stored product

### ❌ Routed to NLP/LLM

**Complex Reasoning:**
```
Which one among them is best?
Will that suit office use?
Compare the second and fourth option
Which one gives better value for money?
```
→ Uses existing LLM fallback mechanism

**Comparisons:**
```
compare that with titan
is that better
which one is better
```
→ Sent directly to Rasa, then LLM if needed

## Benefits

1. **Reduced LLM Calls** - Simple contextual references handled deterministically
2. **Lower Latency** - No LLM invocation for basic references
3. **Improved Continuity** - Users can naturally refer to previous products
4. **Better Entity Extraction** - Expanded queries give Rasa more context
5. **Scalability** - Lightweight Redis storage vs. full conversation history
6. **Cost Efficiency** - Fewer API calls to LLM services

## Integration Points

### Existing Flow (Preserved)

```
User Query → Rasa NLU → (if low confidence) → LLM → Rasa Actions → Response
```

### New Flow (Added Layer)

```
User Query → Context Expansion → Rasa NLU → (if low confidence) → LLM → Rasa Actions → Response
                     ↓                                                          ↓
              Redis Session Memory ←─────────────────────────────────── Entity Update
```

## Configuration

No additional configuration required. The feature automatically activates when:
- Redis is enabled (`REDIS_URL` set)
- Cache service is available

## Redis Keys

Session context keys follow the pattern:
```
calisto:session:context:{session_id}
```

TTL: 1800 seconds (30 minutes)

## Logging

Context expansion events are logged for observability:

```
[Context] Query expansion applied: "show that" → "show raymond glasses"
[Context] Updated session user_123: {"brand":"Raymond","product":"glasses"}
```

## Testing

Run the example test to see detection in action:

```bash
cd chatbot-integrations
npx tsx src/core/context/test-examples.ts
```

## Limitations

1. **No conversation history** - Only stores current interest, not full dialogue
2. **Single product context** - Last mentioned product overwrites previous
3. **No disambiguation** - If user discusses multiple products, context switches
4. **Simple pattern matching** - Not semantic understanding
5. **Session-based** - Different channels = different sessions

## Future Enhancements

- [ ] Support multiple product contexts (compare A vs B)
- [ ] Semantic similarity matching for "similar to that"
- [ ] Cross-session context (long-term user preferences)
- [ ] Context confidence scoring
- [ ] Explicit context confirmation ("Do you mean Raymond glasses?")

## Performance Impact

- **Redis read/write:** ~1-2ms per query
- **Pattern matching:** <1ms per query
- **Zero LLM calls** for simple references
- **Net latency reduction:** 100-500ms (vs LLM invocation)

## Compatibility

✅ **Compatible with:**
- All existing Rasa intents/entities
- LLM fallback mechanism
- Opportunistic slot filling
- Support keyword detection
- All channel integrations

❌ **Does NOT interfere with:**
- Form handling
- Active loop processing
- Rasa tracker state
- Product/knowledge caching
- Lead capture flows
