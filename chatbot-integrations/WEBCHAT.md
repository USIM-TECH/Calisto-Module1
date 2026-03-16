# Website Chatbot Integration

This document is only for integrating the chatbot into a website.

## Endpoints

- Website chat API: `POST /webchat/message`
- Local test page: `GET /webchat/test`

Base URL in local development:

```bash
http://localhost:3000
```

So the full local URLs are:

```bash
http://localhost:3000/webchat/message
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
      "Content-Type": "application/json"
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

Start the services, then open:

```bash
http://localhost:3000/webchat/test
```

That page is a simple built-in playground for testing the website chatbot flow.
