# Telegram Webhook Setup

Use this command to register the Telegram webhook for the bot:

```bash
curl -s -X POST "https://api.telegram.org/bot8748074531:AAG2IPrztL_wjRcDWuaCLK8i43eRmi4WIMQ/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://upgrading-alto-quotes-supplies.trycloudflare.com/webhooks/telegram", "allowed_updates": ["message", "edited_message", "callback_query"]}' | python3 -m json.tool
```
