#!/usr/bin/env bash
# Re-point Meta webhook callbacks to the CURRENT Cloudflare quick-tunnel URL.
#   WhatsApp  : per-number override_callback_uri  (API-settable)  -> automated
#   Messenger : object=page /subscriptions        (API-settable)  -> automated
#   Instagram : DASHBOARD ONLY (Meta forbids setting it via API)  -> printed only
#
# Why this exists: a Cloudflare quick tunnel gets a NEW random hostname every
# time `cloudflared` restarts. Each restart silently breaks every Meta webhook
# callback. This script reads the live tunnel URL straight from cloudflared so
# you never paste a stale URL again.
#
# Usage:
#   ./scripts/set-meta-webhooks.sh                       # auto-detect tunnel URL
#   ./scripts/set-meta-webhooks.sh https://abc.trycloudflare.com   # explicit URL
#   BASE_URL=https://abc.trycloudflare.com ./scripts/set-meta-webhooks.sh
#
# Requirements: curl, python3, and a running `cloudflared tunnel --url http://localhost:3000`
# Reads credentials from ../.env (chatbot-integrations/.env).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"
GRAPH_VERSION="${GRAPH_VERSION:-v25.0}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

# Read a single KEY=value from .env (ignores commented lines, keeps '=' in value).
get_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r'; }

# ---- Resolve the live tunnel base URL -------------------------------------
detect_tunnel_url() {
  # Try the explicit arg / env first.
  if [[ -n "${BASE_URL:-}" ]]; then echo "$BASE_URL"; return 0; fi
  if [[ -n "${1:-}" ]]; then echo "$1"; return 0; fi
  # cloudflared exposes the quick-tunnel hostname on its metrics server.
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
BASE_URL="${BASE_URL%/}"   # strip trailing slash
echo ">>> Using tunnel base URL: $BASE_URL"
echo

# ---- Credentials from .env -------------------------------------------------
APP_ID="$(get_env INSTAGRAM_CLIENT_ID)"; [[ -z "$APP_ID" ]] && APP_ID="$(get_env MESSENGER_CLIENT_ID)"
APP_SECRET="$(get_env MESSENGER_CLIENT_SECRET)"; [[ -z "$APP_SECRET" ]] && APP_SECRET="$(get_env INSTAGRAM_CLIENT_SECRET)"
APP_TOKEN="${APP_ID}|${APP_SECRET}"

IG_ID="$(get_env INSTAGRAM_ID)"
IG_TOKEN="$(get_env INSTAGRAM_ACCESS_TOKEN)"
IG_VERIFY="$(get_env INSTAGRAM_VERIFY_TOKEN)"

PAGE_ID="$(get_env MESSENGER_PAGE_ID)"
PAGE_TOKEN="$(get_env MESSENGER_PAGE_ACCESS_TOKEN)"
MSG_VERIFY="$(get_env MESSENGER_VERIFY_TOKEN)"

WA_PHONE_ID="$(get_env WHATSAPP_PHONE_NUMBER_ID)"
WA_TOKEN="$(get_env WHATSAPP_ACCESS_TOKEN)"
WA_VERIFY="$(get_env WHATSAPP_VERIFY_TOKEN)"
WABA_ID="${WABA_ID:-}"   # optional: only needed to (re)subscribe the WABA

if [[ -z "$APP_ID" || -z "$APP_SECRET" ]]; then
  echo "ERROR: APP_ID / APP_SECRET missing in .env (INSTAGRAM_CLIENT_ID + MESSENGER_CLIENT_SECRET)." >&2
  exit 1
fi

pretty() { python3 -m json.tool 2>/dev/null || cat; }

set_app_callback() { # object, callback_path, fields
  local object="$1" path="$2" fields="$3"
  echo "--- Set app-level callback ($object) -> ${BASE_URL}${path} ---"
  curl -sS -X POST "https://graph.facebook.com/${GRAPH_VERSION}/${APP_ID}/subscriptions" \
    -d "object=${object}" \
    -d "callback_url=${BASE_URL}${path}" \
    -d "verify_token=${4:-calisto_verify}" \
    -d "fields=${fields}" \
    -d "include_values=true" \
    -d "access_token=${APP_TOKEN}" | pretty
  echo
}

# ---- Instagram -------------------------------------------------------------
# IMPORTANT: Meta does NOT allow setting the Instagram (Instagram Login) webhook
# callback URL via the Graph API. Per the official docs:
#   "Webhooks for Instagram is not supported. Instagram webhooks must be
#    configured using the App Dashboard."
# A POST to /{app-id}/subscriptions with object=instagram returns success but
# does not affect delivery, and can DISTURB the dashboard-configured webhook.
# So we deliberately do NOT touch Instagram here. Configure it once in the
# dashboard, ideally with a STABLE tunnel hostname so it never changes.
echo "==================== INSTAGRAM ===================="
echo "Instagram callback CANNOT be set via API (Meta limitation)."
echo "Set it in the App Dashboard -> Instagram -> API setup -> Webhooks -> Configure:"
echo "    Callback URL : ${BASE_URL}/webhooks/instagram"
echo "    Verify Token : ${IG_VERIFY:-calisto_verify}"
echo "Tip: use a stable/named tunnel hostname so you only do this ONCE."
echo

# ---- Messenger (Page) ------------------------------------------------------
if [[ -n "$PAGE_ID" && -n "$PAGE_TOKEN" ]]; then
  echo "==================== MESSENGER ===================="
  set_app_callback "page" "/webhooks/messenger" "messages,messaging_postbacks,message_deliveries,message_reads" "${MSG_VERIFY:-calisto_verify}"
  echo "--- Subscribe Page ($PAGE_ID) ---"
  curl -sS -X POST "https://graph.facebook.com/${GRAPH_VERSION}/${PAGE_ID}/subscribed_apps" \
    -d "subscribed_fields=messages,messaging_postbacks,feed" \
    -d "access_token=${PAGE_TOKEN}" | pretty
  echo
else
  echo "(skipping Messenger: MESSENGER_PAGE_ID / MESSENGER_PAGE_ACCESS_TOKEN not set)"
fi

# ---- WhatsApp --------------------------------------------------------------
if [[ -n "$WA_PHONE_ID" && -n "$WA_TOKEN" ]]; then
  echo "==================== WHATSAPP ===================="
  set_app_callback "whatsapp_business_account" "/webhooks/whatsapp" "messages" "${WA_VERIFY:-calisto_verify}"
  if [[ -n "$WABA_ID" ]]; then
    echo "--- Subscribe WABA ($WABA_ID) ---"
    curl -sS -X POST "https://graph.facebook.com/${GRAPH_VERSION}/${WABA_ID}/subscribed_apps" \
      -H "Authorization: Bearer ${WA_TOKEN}" | pretty
    echo
  fi
  echo "--- Override callback on phone number ($WA_PHONE_ID) ---"
  curl -sS -X POST "https://graph.facebook.com/${GRAPH_VERSION}/${WA_PHONE_ID}" \
    -H "Authorization: Bearer ${WA_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"webhook_configuration\":{\"override_callback_uri\":\"${BASE_URL}/webhooks/whatsapp\",\"verify_token\":\"${WA_VERIFY:-calisto_verify}\"}}" | pretty
  echo
else
  echo "(skipping WhatsApp: WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN not set)"
fi

# ---- Verify ----------------------------------------------------------------
echo "==================== VERIFY ===================="
echo "App-level callbacks now configured:"
curl -sS -G "https://graph.facebook.com/${GRAPH_VERSION}/${APP_ID}/subscriptions" \
  --data-urlencode "access_token=${APP_TOKEN}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);[print(f\"  {o['object']:28} active={o.get('active')}  {o.get('callback_url')}\") for o in d.get('data',[])]" 2>/dev/null
echo
echo "Done. All callbacks above should point at: $BASE_URL"
