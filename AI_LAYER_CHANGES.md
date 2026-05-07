# AI Layer — Change Log

> **Current architecture (May 2026):** Rasa NLU is the **primary** intent
> classifier. The LLM (Llama 3 via Ollama) is consulted **only when Rasa NLU is
> unsure**, and a final low-confidence outcome falls back to Rasa's own
> `action_default_fallback`. There is **no** post-Rasa response-rewrite layer
> any more.

---

## 1. Current architecture

```
User message (WhatsApp / Instagram / Messenger / Telegram / X / Webchat)
        │
        ▼
chatbot-integrations (Node/TS, :3000)
        │
        ├── 1. POST Rasa /model/parse
        │        intent.name != nlu_fallback AND confidence ≥ RASA_NLU_CONFIDENCE_FLOOR (0.4)
        │           → forward raw text to /webhooks/rest/webhook
        │
        ├── 2. LlmIntentClassifier (Llama 3 via Ollama, :11434)   [fallback only]
        │        only invoked when Rasa NLU is unsure
        │        confidence ≥ LLM_CONFIDENCE_FLOOR (0.35)
        │           → send /intent_name{"entity":"value"} to /webhooks/rest/webhook
        │        confidence  < LLM_CONFIDENCE_FLOOR
        │           → forward raw text — Rasa's FallbackClassifier + RulePolicy
        │             trigger `action_default_fallback` (utter_default)
        │
        ▼
Rasa core (:5005)  ── runs deterministic rules / forms / actions
        ▼
Rasa action server (:5055)
        ▼
Reply forwarded to the originating channel verbatim (no rewriter)
```

Active-form short-circuit: if `lead_capture_form` (or any other Rasa form) is
running, the LLM is skipped entirely and raw text goes straight to Rasa, so the
form's slot validators get the real user input.

If the user types a string that already starts with `/` (e.g. via a quick-reply
button or test harness), it is treated as an intent-trigger payload and sent to
Rasa unchanged — both `/model/parse` and the LLM are skipped.

| Decision | Chosen value |
|---|---|
| Primary classifier | Rasa NLU pipeline (DIET + FallbackClassifier @ 0.40) |
| Fallback classifier | Llama 3 via Ollama (configurable via `OLLAMA_MODEL`) |
| Ollama host | `http://localhost:11434` (default) |
| When to invoke LLM | `intent.name === 'nlu_fallback'` OR `confidence < 0.4` |
| When to abandon LLM | LLM `intent === 'nlu_fallback'` OR `confidence < 0.35` |
| Final fallback | Rasa's own `action_default_fallback` / `utter_default` |
| Response rewriting | **Removed.** Rasa replies forwarded verbatim. |
| Form handling | LLM skipped while any Rasa form loop is active |
| Entity extraction | Rasa primary. LLM emits entities only when it is the classifier. |
| Informal-English normalization | `wanna / gonna / gotta / u / plz / …` expanded before LLM classification; few-shot examples cover the same cases. |

---

## 2. Files

### `chatbot-integrations/src/core/utils/llm-client.ts`
Hosts `LlmIntentClassifier` only. Calls `POST http://localhost:11434/api/chat`
with a JSON-schema response format and a system prompt that lists every valid
intent and entity. Returns `{ intent, entities, confidence, raw }`. Defensive
sanitizers drop unknown intents/entities and clamp confidence to `[0, 1]`.

`expandInformalEnglish()` rewrites common chat contractions before classification
so the model sees phrasings close to the few-shot examples.

### `chatbot-integrations/src/core/utils/nlp-client.ts`
`NLPClient.getResponse()` is the single entry point all channels share. Flow:

1. Fetch the Rasa tracker (so we know `active_loop` and `preferred_language`).
2. If a form is active or the message already starts with `/`, forward raw text
   and skip both `/model/parse` and the LLM.
3. Otherwise call Rasa `/model/parse`. If the result is confident (intent !=
   `nlu_fallback` AND `confidence >= nluConfidenceFloor`), forward raw text to
   the webhook — Rasa will re-run NLU and execute its rules.
4. Otherwise call the LLM. On a confident classification we send the
   `/intent_name{"entity":"value"}` trigger payload to Rasa. On low LLM
   confidence we forward the raw text and let Rasa's `FallbackClassifier` →
   `action_default_fallback` produce the user-facing fallback message.

### `chatbot-integrations/src/config/index.ts`
Env-driven config block:

```
LLM_LAYER_ENABLED=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
OLLAMA_TIMEOUT_MS=8000
OLLAMA_TEMPERATURE=0.1
RASA_NLU_CONFIDENCE_FLOOR=0.4
LLM_CONFIDENCE_FLOOR=0.35
```

Exposed on `AppConfig` as `config.llm = { enabled, ollamaUrl, model, timeoutMs,
temperature, nluConfidenceFloor, llmConfidenceFloor }`.

### `chatbot-integrations/src/app/dependencies.ts`
Creates a single `LlmIntentClassifier` when `config.llm.enabled === true` and
passes it (plus the two confidence floors) to `new NLPClient(...)`. Channels
remain untouched — every inbound message funnels through `LeadOrchestrator →
NLPClient`, so all five chat channels (WhatsApp, Instagram, Messenger, Telegram,
X) and the webchat get the new fallback flow automatically.

---

## 3. What changed compared to the previous "AI-first" iteration

| Area | Previous | Current |
|---|---|---|
| Primary intent classifier | Llama 3 via Ollama on every turn | Rasa NLU on every turn |
| LLM role | Always classified before Rasa | Only consulted when Rasa NLU returns `nlu_fallback` / low confidence |
| Response rewriter | `LlmResponseRewriter` rephrased every Rasa text reply | **Removed.** Replies forwarded verbatim. |
| Latency on confident messages | 1× LLM call + Rasa | Just Rasa `/model/parse` + Rasa webhook |
| Latency on unsure messages | Same 1× LLM call | 1× Rasa parse + 1× LLM call + Rasa webhook |
| Variant cache (`LruVariantCache`) | Stored 5 variants per Rasa template | Removed — every reply is the canonical Rasa template |
| Env vars removed | — | `LLM_REWRITE_*` (6 vars) |
| Env vars added | — | `RASA_NLU_CONFIDENCE_FLOOR`, `LLM_CONFIDENCE_FLOOR` |
| Fallback message source | LLM-generated when classifier returned `nlu_fallback` (could vary) | Rasa's own `utter_default` (deterministic, defined in `domain.yml`) |
| Code size in `llm-client.ts` | Classifier + Rewriter + LRU cache + helpers | Classifier only |

---

## 4. How to run

### Prerequisites (only if LLM fallback is enabled)

```bash
ollama serve &            # usually already running as a systemd/user service
ollama pull llama3
ollama list               # verify llama3 appears
```

To run **without the LLM fallback at all**, set `LLM_LAYER_ENABLED=false` in
`chatbot-integrations/.env`. The integration service then runs in
"Rasa-only" mode and any low-confidence message goes straight to
`action_default_fallback`.

### Start Rasa + action server

```bash
cd calisto_nlp_export
docker compose down
docker compose build --no-cache rasa action-server
docker compose run --rm rasa train
docker compose up -d
docker compose ps
curl -sf http://localhost:5005/health  && echo "rasa ok"
curl -sf http://localhost:5055/health  && echo "actions ok"
```

### Start the Node integration service

```bash
cd chatbot-integrations
npm install
npm run build
npm start
```

Expected log lines on startup:

```
[INFO] LLM fallback classifier enabled: model=llama3 ollama=http://localhost:11434 (invoked when Rasa NLU confidence < 0.4)
[INFO] NLP client configured for http://localhost:5005
[INFO] <Channel> channel enabled  (×5)
[INFO] Chatbot integrations server running on port 3000
```

If `LLM_LAYER_ENABLED=false`:

```
[INFO] LLM fallback classifier disabled (LLM_LAYER_ENABLED=false); Rasa-only mode
```

### End-to-end smoke test

```bash
curl -sS -X POST http://localhost:3000/webchat/message \
  -H "Content-Type: application/json" \
  -d '{"senderId":"smoke1","text":"hello"}' | jq
```

Logs for a Rasa-confident message:

```
[DEBUG] [NLU] Rasa classified "hello" as greet (confidence=0.99) — forwarding raw text
[DEBUG] [NLP] Sending to Rasa: sender="smoke1", message="hello", route=raw
[DEBUG] [NLP] Rasa response: Welcome to Calisto Eyewear...
```

Logs for an unsure message that the LLM rescues:

```
[INFO]  [NLU] Rasa unsure (nlu_fallback@1.00) for "i wanna book appointment" — invoking LLM fallback
[DEBUG] [LLM] intent=book_appointment confidence=0.90 entities={"preferred_service":"Appointment Booking"}
[INFO]  [LLM] Routed "i wanna book appointment" -> /book_appointment{"preferred_service":"Appointment Booking"} (confidence=0.90)
[DEBUG] [NLP] Sending to Rasa: sender="smoke1", message="/book_appointment{...}", route=llm-trigger
[DEBUG] [NLP] Rasa response: I can help you book an appointment...
```

Logs when even the LLM is unsure:

```
[INFO]  [NLU] Rasa unsure (nlu_fallback@1.00) for "asdf qwerty" — invoking LLM fallback
[INFO]  [LLM] Low confidence (0.00) for "asdf qwerty" — letting Rasa fallback fire
[DEBUG] [NLP] Sending to Rasa: sender="smoke1", message="asdf qwerty", route=fallback-raw
[DEBUG] [NLP] Rasa response: I'm not sure I caught that. Could you rephrase?
```

### Health endpoint

`GET http://localhost:3000/health` reports Rasa health and (if enabled) LLM
health (ok / unreachable, and whether the configured model is actually pulled).

---

## 5. Known follow-ups (not done in this session)

- **Extra tracker round-trip** — every inbound message fetches the Rasa tracker
  before classification so we can see `active_loop`. On localhost this is
  ~10 ms but could be cached per sender in memory.
- **Confidence floors** are now env-tunable (`RASA_NLU_CONFIDENCE_FLOOR`,
  `LLM_CONFIDENCE_FLOOR`). Once you have real traffic, tune both based on
  observed misclassifications.
- **Unused intents / utterances** — `stories.yml` / `rules.yml` never reference
  `affirm`, `deny`, `share_email`, `share_location`, `share_name`, `share_phone`,
  `share_timeline`, or several `utter_*` responses. These warnings are
  pre-existing; they can be cleaned up in a follow-up.
