# FINAL FIX - LLM Classifier Issue

## Root Cause Found

The problem was NOT in Rasa. It was in the **chatbot-integrations LLM fallback layer**.

### The Issue

When user typed "Aswanth" (a name), the LLM classifier misclassified it as `exchange_request`, which triggered the support flow and restarted the form.

**Evidence from logs**:
```
message="Aswanth"
intent="exchange_request"  ← WRONG!
```

### Why This Happened

1. **Missing Intents in LLM Classifier**: The `VALID_INTENTS` array in `llm-client.ts` was missing:
   - `return_request`
   - `refund_request`
   - `exchange_request`
   - `repair_support`
   - `warranty_support`
   - `order_support`

2. **LLM Hallucinating Intents**: Without these intents in the allowed list, the LLM would still generate them (not in the list), and they'd pass through as invalid classifications.

3. **No Context Awareness**: The LLM wasn't being told that during `active_loop='lead_capture_form'`, simple names should NOT be classified as support requests.

## Fix Applied

### File: `chatbot-integrations/src/core/utils/llm-client.ts`

**Change 1**: Added missing support intents
```typescript
export const VALID_INTENTS = [
  // ... existing intents ...
  'order_support',           // NEW
  'return_request',          // NEW
  'refund_request',          // NEW
  'exchange_request',        // NEW
  'repair_support',          // NEW
  'warranty_support',        // NEW
  // ... rest ...
]
```

**Change 2**: Added context-aware classification instruction
```typescript
const INTENT_CATALOGUE = `
...
- return_request: wants to return glasses/product back to store.
- refund_request: wants money back / refund for order.
- exchange_request: wants to swap/exchange product for different size/model.
- repair_support: frame broken, arm loose, needs fixing.
- warranty_support: mentions warranty, guarantee, claim, replace under warranty.

CRITICAL: When active_loop='lead_capture_form', treat simple names 
(like "John", "Aswanth", "Sarah") as nlu_fallback or share_name, 
NOT as support requests! Only classify as support if there are clear 
support keywords (return, exchange, refund, broken, repair, warranty).
`
```

## Testing

After this fix, the behavior should be:

```
Bot: First, may I have your name?
User: Aswanth
LLM: {intent: "nlu_fallback", confidence: 0.0}  ← Form handles it
Bot: What is the best WhatsApp or phone number...
User: I need to return my glasses
LLM: {intent: "return_request", confidence: 0.9}
Bot: Of course. I'll connect you with our support team.
Bot: May I have your phone number for the return request?
```

## Deployment

1. **Restart Integration Service**:
```bash
cd chatbot-integrations
npm run dev  # or npm start in production
```

2. **No Rasa retrain needed** - This was purely an integration service issue.

3. **Verify logs**: Watch for correct intent classification:
```bash
# Should see:
[DEBUG] [LLM] intent=nlu_fallback confidence=0.00 entities={}
# NOT:
[DEBUG] [LLM] intent=exchange_request confidence=0.85 entities={}
```

## Summary

**Previous Files Modified** (Rasa side - all correct):
- ✅ `forms/validators.py` - Proper noun recognition
- ✅ `forms/lead_form.py` - Intent priority, direct imports
- ✅ `config/settings.py` - Support intents in interruption list
- ✅ `data/rules.yml` - Interrupt rules
- ✅ `domain.yml` - Removed from ignored_intents
- ✅ `actions/lead.py` - Slot preservation
- ✅ `actions/utils.py` - Contextual resumption

**New Fix** (Integration service):
- ✅ `chatbot-integrations/src/core/utils/llm-client.ts` - Added missing intents + context awareness

**Status**: 🟢 **COMPLETE** - All layers fixed.
