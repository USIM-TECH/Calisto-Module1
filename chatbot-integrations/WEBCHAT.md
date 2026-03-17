# Website Chatbot Integration

This document is only for integrating the chatbot into a website.

## Endpoints

- Website chat API: `POST /webchat/message`
- Customer chat page: `GET /webchat`
- Local test page: `GET /webchat/test`

Base URL in local development:

```bash
http://localhost:3000
```

So the full local URLs are:

```bash
http://localhost:3000/webchat/message
http://localhost:3000/webchat
http://localhost:3000/webchat/test
```

## Request Format

Send JSON to the website chat endpoint:

```json
{
  "senderId": "website-user-1",
  "message": "hi"
}
```

Fields:

- `senderId`: your website session/user id
- `message`: the user message text

## Response Format

Example response:

```json
{
  "senderId": "website-user-1",
  "leadId": "lead_123",
  "conversationId": "website-user-1",
  "messages": [
    {
      "type": "text",
      "text": "Hello"
    }
  ]
}
```

The `messages` array can contain:

- `text`
- `image`
- `choice`

Example `choice` response:

```json
{
  "type": "choice",
  "text": "What are you looking for today?",
  "options": [
    { "label": "Browse Frames", "value": "/search_frames" },
    { "label": "Track Order", "value": "/track_order" }
  ]
}
```

## Frontend Example

```js
async function sendMessage(message, senderId = "website-user-1") {
  const response = await fetch("http://localhost:3000/webchat/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_WEBSITE_AUTH_TOKEN"
    },
    body: JSON.stringify({
      senderId,
      message
    })
  });

  return response.json();
}
```

## Local Testing

Start the services, then open either:

```bash
http://localhost:3000/webchat
http://localhost:3000/webchat/test
```

- `/webchat` is the customer-facing website chat page.
- `/webchat/test` is the admin/internal test console.

## Security And Reporting

- If `WEBSITE_AUTH_TOKEN` is set, send it as a bearer token.
- If `WEBSITE_ALLOWED_ORIGINS` is set, only those origins should call the API.
- Rate limiting is controlled by `WEBSITE_RATE_LIMIT_MAX` and `WEBSITE_RATE_LIMIT_WINDOW_MS`.
- Runtime lead and conversation data is stored under `DATA_DIR`.
