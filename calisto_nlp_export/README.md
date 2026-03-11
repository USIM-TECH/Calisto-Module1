# Calisto NLP Export

Rasa project used by the chatbot integration service.

## What Is Here

- `data/`: NLU, rules, and stories
- `domain.yml`: intents, slots, forms, responses
- `actions/actions.py`: custom actions and validators
- `docker-compose.yml`: Rasa server + action server

## Important Limitation

The custom actions still use in-memory catalog, order, and store data. That is suitable for demo and development only. Production readiness requires replacing those helpers with real backend/API calls.

## Run With Docker

```bash
cd calisto_nlp_export
mkdir -p models 
docker compose run --rm rasa train
docker compose up -d --build
```

Services:
- Rasa API: `http://localhost:5005`
- Action server: `http://localhost:5055`

## Run Locally

Use Python 3.8 to 3.10.

```bash
cd calisto_nlp_export
./start.sh local
```

## Verify

```bash
curl -X POST http://localhost:5005/webhooks/rest/webhook \
  -H "Content-Type: application/json" \
  -d '{"sender":"test-user","message":"hi"}'
```
