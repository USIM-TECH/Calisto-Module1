# Lead Capture Interruption & Proper Noun Recognition - Fix Summary

## Issues Fixed

### Issue 1: Support Intents Hijacking Lead Capture ✅

**Problem:** When users expressed support intents (return, exchange, refund, repair, warranty, order tracking) during lead capture, the bot would restart from "First, may I have your name?" even if the name was already collected.

**Solution:**
1. Added support intent interruption rules in `data/rules.yml` for all support intents
2. Updated `config/settings.py` to include support intents in `FORM_INTERRUPTION_INTENTS`
3. Removed support intents from `ignored_intents` in `domain.yml` form configuration
4. Updated `actions/lead.py` `ActionHandleLeadCaptureInterruption` to preserve collected slots
5. Enhanced `actions/utils.py` `route_support_flow` to provide contextual messages based on already-collected information

**Key Changes:**
- Slots are now preserved when interrupting lead capture flow
- Support requests are handled immediately without losing context
- Bot provides contextual prompts: "May I have your phone number so our team can contact you regarding the return request?" instead of "First, may I have your name?"

### Issue 2: Proper Noun Recognition ✅

**Problem:** Names with lowercase letters (aswanth, rahul, john) were not being recognized or normalized properly.

**Solution:**
1. Updated `forms/validators.py` `is_valid_name()` to accept names regardless of capitalization
2. Updated `normalize_name()` to properly capitalize all words: "aswanth" → "Aswanth", "john doe" → "John Doe"
3. Added support keywords (return, exchange, refund, repair, warranty, broken, order) to disallowed keywords list

**Key Changes:**
- Case-insensitive regex pattern: `re.fullmatch(r"[A-Za-z][A-Za-z .'\\-]{1,59}", normalized, re.IGNORECASE)`
- Automatic capitalization: `" ".join(word.capitalize() for word in raw.split())`
- Rejects names containing support keywords to prevent slot hijacking

### Issue 3: Intent Priority Over Slot Filling ✅

**Problem:** User messages expressing intents were being interpreted as slot values instead of triggering intent handlers.

**Solution:**
1. Added intent detection at the START of every slot validator method in `forms/lead_form.py`
2. Each validator now checks for interruption intents BEFORE validating the slot value
3. Added logging for debugging: `logger.info(f"[FORM] Intent interruption detected in validate_{slot_name}: {intent['name']}")`

**Key Changes:**
```python
# Check for intent interruption FIRST before validating the slot value
intent = _get_latest_intent(tracker)
support_intent, _override_reason, _keyword_match = _detect_support_intent(tracker)

if support_intent or (
    intent["name"] in FORM_INTERRUPTION_INTENTS
    and intent["confidence"] >= INTENT_CONFIDENCE_THRESHOLD
):
    return {
        slot_name: None,
        "requested_slot": None,
        "current_flow": _resolve_interruption_flow(tracker, intent["name"]),
    }
```

### Issue 4: Resume Flows Instead of Restarting ✅

**Problem:** When returning to lead capture after interruption, the bot would restart from "First, may I have your name?" even if name was already collected.

**Solution:**
1. Updated `actions/lead.py` to preserve all `PERSISTENT_SLOTS` during interruptions
2. Updated `actions/utils.py` `route_support_flow()` to check for already-collected slots
3. Added contextual messaging based on what information is still needed
4. Form now resumes from the next unanswered slot instead of restarting

**Key Changes:**
- Collected slots tracked: `collected_slots = {slot_name: value for slot_name in PERSISTENT_SLOTS if value and value != "skipped"}`
- Contextual prompts: If name exists, skip to "May I have your phone number..."
- Logged preserved state: `logger.info(f"[INTERRUPTION] Pausing form with collected slots: {list(collected_slots.keys())}")`

## Files Modified

1. **forms/validators.py**
   - Updated `is_valid_name()` for case-insensitive validation
   - Updated `normalize_name()` for proper capitalization
   - Added support keywords to disallowed list

2. **forms/lead_form.py**
   - Added intent interruption checks in `_reject_slot()`
   - Added intent checks at start of all 6 slot validators
   - Added logging for debugging interruptions

3. **config/settings.py**
   - Added support intents to `FORM_INTERRUPTION_INTENTS`

4. **data/rules.yml**
   - Added 10 new rules for support intent interruptions during lead capture

5. **domain.yml**
   - Removed support intents from `ignored_intents` in form configuration

6. **actions/lead.py**
   - Updated `ActionHandleLeadCaptureInterruption` to preserve slots
   - Added support for `support_and_policies` and `ask_a_question` intents

7. **actions/utils.py**
   - Updated `route_support_flow()` to provide contextual messages
   - Added logic to check already-collected slots
   - Preserved lead slots during support flow routing

## Testing Scenarios

### Scenario 1: Name Already Collected
```
Bot: First, may I have your name?
User: Aswanth
Bot: What is the best WhatsApp or phone number...
User: I need to return my glasses
Bot: Of course. I'll connect you with our support team for your return request right away.
Bot: May I have your phone number so our team can contact you regarding the return request?
```

### Scenario 2: Lowercase Name
```
Bot: First, may I have your name?
User: aswanth
✅ Accepted and normalized to "Aswanth"
```

### Scenario 3: Multi-word Name
```
Bot: First, may I have your name?
User: john doe
✅ Accepted and normalized to "John Doe"
```

### Scenario 4: Support Intent as Name
```
Bot: First, may I have your name?
User: I need to return my glasses
✅ Detected as return_request intent, not stored as name
Bot: Of course. I'll connect you with our support team...
```

## Architecture Improvements

1. **Priority-Based Intent Detection**: Intents are now checked BEFORE slot validation at every step
2. **Stateful Interruptions**: Collected information is preserved across flow switches
3. **Contextual Resumption**: Bot provides relevant prompts based on what's already known
4. **Firewall Protection**: Support keywords prevent slot hijacking
5. **Comprehensive Logging**: All interruptions are logged for debugging

## Deployment Instructions

1. Retrain the Rasa model:
```bash
cd calisto_nlp_export
docker compose run --rm rasa train
```

2. Restart services:
```bash
docker compose down
docker compose up -d --build
```

3. Verify the action server is running:
```bash
docker compose logs -f actions
```

4. Test the fixes using the scenarios above

## Configuration

**Intent Confidence Threshold**: `0.7` (defined in `config/settings.py`)
- Intents with confidence ≥ 0.7 will interrupt form filling
- Support keyword detection provides a firewall regardless of confidence

**Persistent Slots**: Name, contact_number, email, lead_location, preferred_service, purchase_timeline
- These slots are preserved across flow transitions
- Never cleared during interruptions

## Regression Prevention

- High NLP accuracy maintained through strict validation
- Support keywords prevent slot contamination
- Intent detection happens before slot filling
- Comprehensive logging for debugging
- All existing business logic preserved
