# Calisto Module 1

## Quick Start

### 1. Start the NLP service

```bash
cd calisto_nlp_export
docker compose down
rm -f models/*.tar.gz
docker compose build --no-cache rasa
mkdir -p models
docker compose run --rm rasa train
docker compose up -d --build
```

Rasa endpoints:
- `http://localhost:5005`
- `http://localhost:5055`



### 2. Start the integration service

```bash
cd chatbot-integrations
npm install
cp .env.example .env
npm run build
npm start
```

Integration service endpoints:
- `http://localhost:3000/`
- `http://localhost:3000/health`
- `http://localhost:3000/webhooks/whatsapp`
- `http://localhost:3000/webhooks/instagram`
- `http://localhost:3000/webhooks/messenger`
- `http://localhost:3000/webchat`
- `http://localhost:3000/webchat/test`
- `http://localhost:3000/reports/leads-dashboard`





### 3. Cloudflare tunnel

```bash
cloudflared tunnel --url http://localhost:3000
```