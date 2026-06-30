#!/usr/bin/env bash
# start-all.sh — one command to bring up the entire Calisto dev stack and wire
# the Meta webhooks to a live Cloudflare tunnel.
#
# What it starts (in order):
#   1. MySQL + Redis            (Docker:  chatbot-integrations/docker-compose.mysql.yml)
#   2. Rasa NLP + action server (Docker:  calisto_nlp_export/docker-compose.yml)
#   3. Cloudflare quick tunnel  (host:    cloudflared -> http://localhost:3000)
#   4. Backend integration API  (host:    npm run dev, port 3000)
#   5. Frontend admin dashboard (host:    npm run dev / vite, port 5173)
#   6. Meta webhooks            (WhatsApp + Messenger via set-meta-webhooks.sh;
#                                Instagram is dashboard-only and is printed, not set)
#   7. Telegram webhook         (register-telegram-webhook.ts when TELEGRAM_BOT_TOKEN is set)
#
# Bootstrap: runs `npm install` when node_modules is missing, and
# `prisma migrate deploy` before starting the backend.
#
# Lifecycle: this script stays in the FOREGROUND and streams the host-process
# logs. Press Ctrl+C once to stop the backend, frontend and tunnel. The Docker
# services (MySQL, Redis, Rasa, action server) are left running on purpose; the
# stop commands are printed on shutdown.
#
# Usage:
#   ./scripts/start-all.sh
#
# Optional env overrides:
#   BACKEND_PORT=3000  FRONTEND_PORT=5173  CF_METRICS_PORT=20241
#   SKIP_TUNNEL=1      # don't start/expect a tunnel (skips webhook wiring too)
#   SKIP_WEBHOOKS=1    # start everything but don't wire Meta/Telegram webhooks

set -uo pipefail

# ---- Paths -----------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTEG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$INTEG_DIR/.." && pwd)"
RASA_DIR="$ROOT_DIR/calisto_nlp_export"
FRONTEND_DIR="$ROOT_DIR/chatbot-frontend"
LOG_DIR="$INTEG_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
CF_METRICS_PORT="${CF_METRICS_PORT:-20241}"
export CF_METRICS_PORT

# ---- Pretty logging --------------------------------------------------------
log()  { printf '\n\033[1;34m>>> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '\033[1;32m    OK: %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    WARN: %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---- Background-process tracking + cleanup ---------------------------------
# We start each host process via `setsid` in its own session so we can kill the
# whole process tree (npm -> tsx/vite -> node) by signalling its process group.
MANAGED_PIDS=()
MANAGED_NAMES=()
CLEANED=0

cleanup() {
  [[ "$CLEANED" == 1 ]] && return
  CLEANED=1
  echo
  log "Stopping host processes (backend, frontend, tunnel)..."
  local i pid name
  for i in "${!MANAGED_PIDS[@]}"; do
    pid="${MANAGED_PIDS[$i]}"; name="${MANAGED_NAMES[$i]}"
    [[ -z "$pid" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      info "stopping $name"
      kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
    fi
  done
  sleep 2
  for pid in "${MANAGED_PIDS[@]:-}"; do
    [[ -z "$pid" ]] && continue
    kill -KILL "-$pid" 2>/dev/null || true
  done
  echo
  info "Docker services were left running. Stop them with:"
  info "  docker compose -f \"$INTEG_DIR/docker-compose.mysql.yml\" down"
  info "  ( cd \"$RASA_DIR\" && docker compose down )"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# start_bg NAME LOGFILE COMMAND_STRING
start_bg() {
  local name="$1" logfile="$2" cmd="$3"
  local pidfile; pidfile="$(mktemp)"
  # The child bash records its own PID (= new session/group leader) to pidfile.
  setsid bash -c 'echo $$ > "'"$pidfile"'"; '"$cmd" >"$logfile" 2>&1 &
  local leader="" tries=0
  while [[ -z "$leader" && $tries -lt 100 ]]; do
    leader="$(cat "$pidfile" 2>/dev/null)"
    sleep 0.05; tries=$((tries + 1))
  done
  rm -f "$pidfile"
  MANAGED_PIDS+=("$leader")
  MANAGED_NAMES+=("$name")
  info "$name started; logs -> $logfile"
}

# ---- Wait helpers ----------------------------------------------------------
http_up() { curl -fsS --max-time 2 "$1" >/dev/null 2>&1; }

wait_for_http() { # url name timeout_s
  local url="$1" name="$2" timeout="${3:-60}" i=0
  while (( i < timeout )); do
    http_up "$url" && { ok "$name is up"; return 0; }
    sleep 1; i=$((i + 1))
  done
  return 1
}

wait_for_mysql() {
  local i=0 status
  while (( i < 60 )); do
    status="$(docker inspect -f '{{.State.Health.Status}}' calisto-mysql 2>/dev/null)"
    [[ "$status" == "healthy" ]] && { ok "MySQL is healthy"; return 0; }
    sleep 2; i=$((i + 1))
  done
  return 1
}

detect_tunnel() { # echoes https://host if a cloudflared quick tunnel is reachable
  local port host
  for port in "$CF_METRICS_PORT" 20241 20242 20243 20244 20245 20246 20247 20248 20249 20250; do
    host="$(curl -fsS --max-time 2 "http://127.0.0.1:${port}/quicktunnel" 2>/dev/null \
      | python3 -c "import sys,json;print(json.load(sys.stdin).get('hostname',''))" 2>/dev/null)"
    [[ -n "$host" ]] && { echo "https://${host}"; return 0; }
  done
  return 1
}

wait_for_tunnel() {
  local i=0 url
  while (( i < 30 )); do
    url="$(detect_tunnel)" && { echo "$url"; return 0; }
    sleep 1; i=$((i + 1))
  done
  return 1
}

# ---- Preflight -------------------------------------------------------------
for bin in docker node npm curl python3; do
  command -v "$bin" >/dev/null 2>&1 || die "required tool not found: $bin"
done
[[ -f "$INTEG_DIR/.env" ]] || die ".env not found at $INTEG_DIR/.env"

# ---- 1. Dependencies -------------------------------------------------------
ensure_deps() { # dir name
  local dir="$1" name="$2"
  if [[ ! -d "$dir/node_modules" ]]; then
    log "Installing $name dependencies (npm install)..."
    ( cd "$dir" && npm install ) || die "npm install failed for $name"
  fi
}
ensure_deps "$INTEG_DIR" "backend"
ensure_deps "$FRONTEND_DIR" "frontend"

# ---- 2. MySQL + Redis ------------------------------------------------------
log "Starting MySQL + Redis (Docker)..."
docker compose -f "$INTEG_DIR/docker-compose.mysql.yml" up -d || die "failed to start MySQL/Redis"
wait_for_mysql || die "MySQL did not become healthy in time"

# ---- 3. Database (Prisma generate + migrate) -------------------------------
log "Preparing database (setup-database.sh --no-docker)..."
if bash "$SCRIPT_DIR/setup-database.sh" --no-docker; then
  ok "database ready"
else
  warn "database setup reported an issue — check output above"
fi

# ---- 4. Rasa NLP + action server -------------------------------------------
log "Starting Rasa NLP + action server (Docker)..."
( cd "$RASA_DIR" && docker compose up -d ) || die "failed to start Rasa stack"
if wait_for_http "http://localhost:5005/version" "Rasa NLP" 90; then :; else
  warn "Rasa NLP not answering yet (model still loading?) — it will keep starting in the background"
fi

# ---- 5. Cloudflare tunnel --------------------------------------------------
TUNNEL_URL=""
if [[ "${SKIP_TUNNEL:-0}" == "1" ]]; then
  log "Skipping Cloudflare tunnel (SKIP_TUNNEL=1)"
else
  log "Starting Cloudflare tunnel -> http://localhost:${BACKEND_PORT} ..."
  if TUNNEL_URL="$(detect_tunnel)"; then
    info "Reusing already-running tunnel: $TUNNEL_URL"
  else
    start_bg "cloudflared" "$LOG_DIR/cloudflared.log" \
      "exec cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:${CF_METRICS_PORT} --url http://localhost:${BACKEND_PORT}"
    if TUNNEL_URL="$(wait_for_tunnel)"; then
      ok "tunnel up: $TUNNEL_URL"
    else
      warn "could not detect the tunnel URL — see $LOG_DIR/cloudflared.log"
    fi
  fi
fi

# ---- 6. Backend ------------------------------------------------------------
log "Starting backend integration API (port ${BACKEND_PORT})..."
if http_up "http://localhost:${BACKEND_PORT}/health"; then
  warn "something is already listening on :${BACKEND_PORT} — reusing it (not managed by this script)"
  [[ -n "$TUNNEL_URL" ]] && warn "if PUBLIC_BASE_URL changed, restart that backend so it picks up $TUNNEL_URL"
else
  # Pass PUBLIC_BASE_URL through the environment so product-card image links use
  # the live tunnel host immediately (dotenv does not override real env vars).
  pub_env=""
  [[ -n "$TUNNEL_URL" ]] && pub_env="PUBLIC_BASE_URL=$TUNNEL_URL "
  start_bg "backend" "$LOG_DIR/backend.log" \
    "cd \"$INTEG_DIR\" && ${pub_env}npm run dev"
  wait_for_http "http://localhost:${BACKEND_PORT}/health" "backend" 60 \
    || warn "backend did not report healthy yet — check $LOG_DIR/backend.log"
fi

# ---- 7. Frontend -----------------------------------------------------------
log "Starting frontend admin dashboard (port ${FRONTEND_PORT})..."
if http_up "http://localhost:${FRONTEND_PORT}"; then
  warn "something is already listening on :${FRONTEND_PORT} — reusing it (not managed by this script)"
else
  start_bg "frontend" "$LOG_DIR/frontend.log" \
    "cd \"$FRONTEND_DIR\" && npm run dev"
  wait_for_http "http://localhost:${FRONTEND_PORT}" "frontend" 60 \
    || warn "frontend did not come up yet — check $LOG_DIR/frontend.log"
fi

# ---- 8. Webhooks (Meta + Telegram) -----------------------------------------
if [[ "${SKIP_WEBHOOKS:-0}" == "1" || "${SKIP_TUNNEL:-0}" == "1" ]]; then
  log "Skipping webhook wiring (SKIP_WEBHOOKS or SKIP_TUNNEL)"
elif [[ -z "$TUNNEL_URL" ]]; then
  warn "no tunnel URL — skipping webhook wiring"
else
  log "Wiring Meta webhooks to $TUNNEL_URL ..."
  if BASE_URL="$TUNNEL_URL" bash "$SCRIPT_DIR/set-meta-webhooks.sh"; then
    ok "Meta webhooks configured"
  else
    warn "Meta webhook setup reported an error (see output above) — services are still running"
  fi

  if grep -qE '^TELEGRAM_BOT_TOKEN=.+' "$INTEG_DIR/.env" 2>/dev/null; then
    log "Registering Telegram webhook -> ${TUNNEL_URL}/webhooks/telegram ..."
    if ( cd "$INTEG_DIR" && npm run telegram:webhook -- "$TUNNEL_URL" ); then
      ok "Telegram webhook configured"
    else
      warn "Telegram webhook setup failed — check TELEGRAM_BOT_TOKEN and output above"
    fi
  else
    info "TELEGRAM_BOT_TOKEN not set in .env — skipping Telegram webhook"
  fi
fi

# ---- Summary + foreground log stream ---------------------------------------
log "Everything is up."
printf '    %-22s %s\n' "Frontend (admin):" "http://localhost:${FRONTEND_PORT}"
printf '    %-22s %s\n' "Backend API:"      "http://localhost:${BACKEND_PORT}"
printf '    %-22s %s\n' "Rasa NLP:"         "http://localhost:5005"
[[ -n "$TUNNEL_URL" ]] && printf '    %-22s %s\n' "Public tunnel:" "$TUNNEL_URL"
echo
info "Streaming logs below. Press Ctrl+C to stop backend, frontend and the tunnel."
echo

# Tail whatever managed logs exist; -F tolerates files that don't exist yet.
tail_targets=()
for f in cloudflared backend frontend; do
  [[ -f "$LOG_DIR/$f.log" ]] && tail_targets+=("$LOG_DIR/$f.log")
done
if (( ${#tail_targets[@]} > 0 )); then
  tail -n 5 -F "${tail_targets[@]}"
else
  # Nothing managed (all reused) — just idle until interrupted.
  while true; do sleep 3600; done
fi
