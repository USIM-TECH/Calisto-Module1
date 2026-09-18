#!/usr/bin/env bash
# Re-register the webhook for every enabled Telegram, WhatsApp and Messenger
# channel account against the CURRENT Cloudflare tunnel URL, in one command.
#
# Why this is needed even after updating PUBLIC_BASE_URL in .env and
# restarting the backend: that only changes the DEFAULT url this backend
# would use IF you register. Telegram/Meta still have whatever callback URL
# was pushed to them during the LAST registration. Nothing external changes
# until you explicitly re-register -- this script does that for you, for
# every eligible account, via the same endpoint the "Register webhook"
# button in the admin UI calls:
#   POST /admin/channel-accounts/api/:id/register-webhook
#
# Instagram is intentionally skipped -- Meta does not allow setting its
# callback via API. Run ./scripts/print-instagram-webhook.sh for that one
# and paste the printed URL into the Meta App Dashboard by hand.
#
# IMPORTANT Messenger caveat: the backend's register-webhook endpoint (and
# therefore this script) only SUBSCRIBES THE PAGE to the app
# (POST /{pageId}/subscribed_apps). It does NOT set the app-level
# callback_url (POST /{appId}/subscriptions?object=page&callback_url=...).
# If Meta's app-level "page" callback still points at an old dead tunnel,
# messages will be posted there and silently lost even though this script
# (and the admin UI's Register webhook button) reports "active". This
# script additionally sets that app-level callback directly so Messenger
# actually works end to end -- see the MESSENGER APP CALLBACK section below.
#
# Usage:
#   ./scripts/register-all-webhooks.sh
#   ./scripts/register-all-webhooks.sh https://abc.trycloudflare.com
#   BASE_URL=https://abc.trycloudflare.com ./scripts/register-all-webhooks.sh
#
# Requirements: curl, python3, backend running on localhost:3000,
# ADMIN_API_TOKEN set in .env.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"

get_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r'; }

detect_tunnel_url() {
  if [[ -n "${BASE_URL:-}" ]]; then echo "$BASE_URL"; return 0; fi
  if [[ -n "${1:-}" ]]; then echo "$1"; return 0; fi
  local port host
  for port in ${CF_METRICS_PORT:-} 20241 20242 20243 20244 20245 20246 20247 20248 20249 20250; do
    [[ -z "$port" ]] && continue
    host="$(curl -fsS --max-time 2 "http://127.0.0.1:${port}/quicktunnel" 2>/dev/null \
      | python3 -c "import sys,json;print(json.load(sys.stdin).get('hostname',''))" 2>/dev/null)"
    if [[ -n "$host" ]]; then echo "https://${host}"; return 0; fi
  done
  return 1
}

BASE_URL="$(detect_tunnel_url "${1:-}")" || {
  echo "ERROR: could not auto-detect the Cloudflare tunnel URL." >&2
  echo "Start it with:  cloudflared tunnel --url http://localhost:3000" >&2
  echo "Or pass it:     $0 https://your-tunnel.trycloudflare.com" >&2
  exit 1
}
BASE_URL="${BASE_URL%/}"
echo ">>> Using tunnel base URL: $BASE_URL"

ADMIN_TOKEN="$(get_env ADMIN_API_TOKEN)"
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ERROR: ADMIN_API_TOKEN not set in $ENV_FILE" >&2
  exit 1
fi

if ! curl -sf --max-time 5 "${BACKEND_URL}/health" >/dev/null; then
  echo "ERROR: backend not reachable at ${BACKEND_URL}. Start it with: npm run dev" >&2
  exit 1
fi

echo
echo "==================== ACCOUNTS ===================="
accounts_json="$(curl -sS -H "Authorization: Bearer ${ADMIN_TOKEN}" "${BACKEND_URL}/admin/channel-accounts/api")"

# Print id + channel + label for every account whose channel is NOT instagram.
eligible="$(echo "$accounts_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data.get('items', []):
    if a.get('channel') != 'instagram' and a.get('enabled'):
        print(f\"{a['id']}\t{a['channel']}\t{a['label']}\")
")"

if [[ -z "$eligible" ]]; then
  echo "No eligible (non-Instagram, enabled) channel accounts found."
  exit 0
fi

echo "$eligible" | while IFS=$'\t' read -r id channel label; do
  echo
  echo "--- Registering ${channel} (${label}) ---"
  result="$(curl -sS -X POST \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"publicBaseUrl\":\"${BASE_URL}\"}" \
    "${BACKEND_URL}/admin/channel-accounts/api/${id}/register-webhook")"
  status="$(echo "$result" | python3 -c "import sys,json;print(json.load(sys.stdin).get('webhookStatus','?'))" 2>/dev/null || echo "?")"
  err="$(echo "$result" | python3 -c "import sys,json;print(json.load(sys.stdin).get('webhookError') or '')" 2>/dev/null || echo "")"
  echo "    status: ${status}"
  [[ -n "$err" ]] && echo "    error:  ${err}"
  sleep 2   # avoid back-to-back calls tripping transient timeouts on Telegram/Meta's side
done

# ---- Messenger app-level callback ------------------------------------------
# The loop above only subscribes the Page (per-account, via our backend).
# It does NOT update the app-level "page" object callback_url that Meta
# actually delivers to. Do that here, once, using the Facebook app's own
# id/secret -- same call scripts/set-meta-webhooks.sh makes.
MSG_APP_ID="$(get_env MESSENGER_CLIENT_ID)"
MSG_APP_SECRET="$(get_env MESSENGER_CLIENT_SECRET)"
has_messenger_account="$(echo "$eligible" | awk -F'\t' '$2=="messenger"{print; exit}')"

if [[ -n "$has_messenger_account" ]]; then
  if [[ -n "$MSG_APP_ID" && -n "$MSG_APP_SECRET" ]]; then
    echo
    echo "==================== MESSENGER APP CALLBACK ===================="
    echo "--- Set app-level callback (page) -> ${BASE_URL}/webhooks/messenger ---"
    curl -sS -X POST "https://graph.facebook.com/v23.0/${MSG_APP_ID}/subscriptions" \
      -d "object=page" \
      -d "callback_url=${BASE_URL}/webhooks/messenger" \
      -d "verify_token=calisto_verify" \
      -d "fields=messages,messaging_postbacks,message_deliveries,message_reads" \
      -d "include_values=true" \
      -d "access_token=${MSG_APP_ID}|${MSG_APP_SECRET}" | python3 -m json.tool 2>/dev/null || echo "(response was not JSON)"
  else
    echo
    echo "WARNING: Messenger account found but MESSENGER_CLIENT_ID / MESSENGER_CLIENT_SECRET"
    echo "         are not set in .env -- cannot set the app-level callback."
    echo "         Messenger will report 'active' but Meta may still deliver to a stale URL."
  fi
fi

echo
echo "==================== DONE ===================="
echo "Instagram is not handled here (Meta forbids API registration)."
echo "Run: ./scripts/print-instagram-webhook.sh"
