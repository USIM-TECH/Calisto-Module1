# Quick Testing Guide - Lead Capture Fixes

## Test 1: Support Intent During Name Collection ✅

**Test Case:**
```
Bot: First, may I have your name?
User: Aswanth
Bot: What is the best WhatsApp or phone number...
User: I need to return my glasses
```

**Expected Behavior:**
```
Bot: Of course. I'll connect you with our support team for your return request right away.
Bot: May I have your phone number so our team can contact you regarding the return request?
```

**NOT:**
```
Bot: First, may I have your name?  ❌ WRONG
```

---

## Test 2: Lowercase Name Acceptance ✅

**Test Cases:**
- `aswanth` → `Aswanth` ✅
- `JOHN DOE` → `John Doe` ✅
- `rahul kumar` → `Rahul Kumar` ✅
- `Vaibhav` → `Vaibhav` ✅
- `mohammed` → `Mohammed` ✅

**Validation:**
All should be accepted and properly capitalized.

---

## Test 3: Support Keywords as Name ❌

**Test Cases:**
- `return` → Rejected ✅
- `exchange` → Rejected ✅
- `refund` → Rejected ✅
- `repair` → Rejected ✅
- `warranty` → Rejected ✅
- `broken` → Rejected ✅
- `order` → Rejected ✅

**Expected:**
Bot should reject and ask for name again, OR detect as support intent.

---

## Test 4: Exchange Request During Phone Collection

**Test Case:**
```
Bot: First, may I have your name?
User: Aswanth
Bot: What is the best WhatsApp or phone number...
User: I want to exchange my glasses
```

**Expected:**
```
Bot: Understood. Let me get our support team on your exchange request.
Bot: May I have your phone number so our team can contact you regarding the exchange request?
```

---

## Test 5: Multiple Interruptions

**Test Case:**
```
Bot: First, may I have your name?
User: John
Bot: What is the best WhatsApp or phone number...
User: Where is your KL store?
Bot: [Shows store information]
User: I need to return my glasses
```

**Expected:**
```
Bot: No problem. I'm routing your return request to the right team now.
Bot: May I have your phone number so our team can contact you regarding the return request?
```

**Key:** Name "John" should still be preserved!

---

## Test 6: Order Tracking Interruption

**Test Case:**
```
Bot: First, may I have your name?
User: Sarah
Bot: What is the best WhatsApp or phone number...
User: Track my order
```

**Expected:**
```
Bot: [Support intro message]
Bot: May I have your phone number so our team can contact you regarding the order tracking/support?
```

---

## Test 7: Warranty Support Interruption

**Test Case:**
```
Bot: First, may I have your name?
User: Mike
Bot: What is the best WhatsApp or phone number...
User: My glasses broke, warranty help
```

**Expected:**
```
Bot: [Policy information if available]
Bot: [Support intro message]
Bot: May I have your phone number so our team can contact you regarding the warranty support?
```

---

## Test 8: Resume After Store Finder

**Test Case:**
```
Bot: First, may I have your name?
User: Lisa
Bot: What is the best WhatsApp or phone number...
User: Find a store in KL
Bot: [Shows stores]
Bot: [Resumes] What is the best WhatsApp or phone number...
```

**Expected:** Should NOT restart from name!

---

## Test 9: All Support Intents

Test each of these interrupts lead capture properly:
- ✅ `return_request`
- ✅ `refund_request`
- ✅ `exchange_request`
- ✅ `repair_support`
- ✅ `warranty_support`
- ✅ `order_support`
- ✅ `order_tracking`
- ✅ `after_sales_support`
- ✅ `human_handoff`

---

## Test 10: Complete Flow Without Interruption

**Test Case:**
```
Bot: First, may I have your name?
User: Aswanth
Bot: What is the best WhatsApp or phone number...
User: 0123456789
Bot: What email address should we use...
User: aswanth@example.com
Bot: Which area or city are you located in...
User: Kuala Lumpur
Bot: What are you mainly interested in today?
User: After-sales Support
Bot: How soon are you planning...
User: This Week
```

**Expected:** Should complete smoothly without errors.

---

## Validation Checklist

After deployment:

- [ ] Lowercase names are accepted and capitalized
- [ ] Support intents interrupt lead capture immediately
- [ ] Previously collected slots are preserved
- [ ] Bot provides contextual prompts (doesn't restart from name)
- [ ] Support keywords as names are rejected
- [ ] Intent detection happens before slot validation
- [ ] Form resumes correctly after interruption
- [ ] No regression in normal lead capture flow
- [ ] All 10 test scenarios pass
- [ ] Logs show proper interruption detection

---

## Debug Commands

Check if form is active:
```python
tracker.active_loop  # Should be 'lead_capture_form' or None
```

Check collected slots:
```python
tracker.get_slot('lead_name')
tracker.get_slot('contact_number')
tracker.get_slot('requested_slot')
```

Check logs for interruptions:
```bash
docker compose logs -f actions | grep "INTERRUPTION"
docker compose logs -f actions | grep "Intent interruption detected"
```

---

## Rollback Plan

If issues occur:

1. Check action server logs:
```bash
docker compose logs actions --tail=100
```

2. Revert changes:
```bash
git checkout HEAD~1 -- forms/validators.py
git checkout HEAD~1 -- forms/lead_form.py
git checkout HEAD~1 -- config/settings.py
```

3. Retrain:
```bash
docker compose run --rm rasa train
docker compose restart
```
