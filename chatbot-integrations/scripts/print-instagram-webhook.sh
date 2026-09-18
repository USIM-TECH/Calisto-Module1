#!/usr/bin/env bash
# Print the Instagram callback URL + verify token to paste into the Meta App
# Dashboard (Instagram -> API setup -> Webhooks -> Configure).
#
# Why this exists as a print-only script, not an automated one: Meta does NOT
# allow setting the Instagram (Instagram Login) webhook callback via the
# Graph API. A POST to /{app-id}/subscriptions with object=instagram returns
# success but does not affect delivery, and can DISTURB the dashboard-
# configured webhook. See scripts/set-meta-webhooks.sh for the same note.
# This script only reads the live tunnel URL and prints values -- it makes
# no API calls, so it cannot break your existing dashboard configuration.
#
# Usage:
#   ./scripts/print-instagram-webhook.sh
#   ./scripts/print-instagram-webhook.sh https://abc.trycloudflare.com
#   BASE_URL=https://abc.trycloudflare.com ./scripts/print-instagram-webhook.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"

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

VERIFY_TOKEN="$(get_env INSTAGRAM_VERIFY_TOKEN)"
VERIFY_TOKEN="${VERIFY_TOKEN:-calisto_verify}"

echo "Paste these into: Meta App Dashboard -> Instagram -> API setup -> Webhooks -> Configure"
echo
echo "  Callback URL : ${BASE_URL}/webhooks/instagram"
echo "  Verify Token : ${VERIFY_TOKEN}"
echo
echo "Before pasting, confirm the backend will actually verify it:"
echo "  curl \"http://localhost:3000/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=test123\""
echo "  (must print: test123)"
