# Chatbot Frontend

React + Vite + Tailwind admin UI and customer-facing `/chatbot` page for Calisto Module 1.

## Setup

```bash
cd chatbot-frontend
npm install
cp .env.example .env
```

## Development

Start the backend first (`chatbot-integrations` on port 3000), then:

```bash
npm run dev
```

Open **http://localhost:5173**

### Backend connection

The dev server proxies API calls to the integration service:

- `/webchat/message` — website chat (used by `/chatbot` and `/webchat`)
- `/reports/*`, `/admin/*`, `/products/*`, `/knowledge/*`, `/static/*`

With the Vite proxy, leave `VITE_API_BASE_URL` empty in `.env` (recommended for local dev).

If you run the frontend without the proxy (e.g. production build), set:

```env
VITE_API_BASE_URL=http://localhost:3000
```

If the backend requires `WEBSITE_AUTH_TOKEN`, also set:

```env
VITE_WEBSITE_AUTH_TOKEN=your-token
```

## Pages

| Route | Purpose |
|-------|---------|
| `/leads` | Lead list |
| `/leads/:customerId` | Lead detail |
| `/products` | Product admin |
| `/knowledge` | Knowledge admin |
| `/webchat` | Internal webchat console (admin layout) |
| `/chatbot` | Customer-facing chat widget page (calls `POST /webchat/message`) |

## Production build

```bash
npm run build
npm run preview
```

Serve `dist/` behind your web server and point `VITE_API_BASE_URL` at the public integration API URL.
