#!/usr/bin/env bash
# ============================================================
# Calisto Eyewear – NLP Service Startup Script
# ============================================================
# Usage:
#   chmod +x start.sh
#   ./start.sh          → auto-detect: Docker if available, else venv
#   ./start.sh docker   → force Docker mode
#   ./start.sh local    → force local venv mode (needs Python 3.8–3.10)
#   ./start.sh actions  → starts only the action server (local)
#   ./start.sh rasa     → starts only the rasa server (local)
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${1:-auto}"

# ── Docker mode ────────────────────────────────────────────
start_docker() {
  echo "🐳 Starting Calisto NLP via Docker Compose..."
  docker compose up --build -d
  echo ""
  echo "✅ Calisto NLP services running (Docker):"
  echo "   • Rasa REST API  → http://localhost:5005"
  echo "   • Action Server  → http://localhost:5055"
  echo ""
  echo "   POST messages to: http://localhost:5005/webhooks/rest/webhook"
  echo "   View logs:        docker compose logs -f"
  echo "   Stop:             docker compose down"
}

# ── Check Python version compatibility ─────────────────────
check_python_version() {
  local py_version
  py_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
  local major minor
  major=$(echo "$py_version" | cut -d. -f1)
  minor=$(echo "$py_version" | cut -d. -f2)
  # Rasa 3.6.x requires Python >=3.8,<3.11
  if [ "$major" -eq 3 ] && [ "$minor" -ge 8 ] && [ "$minor" -le 10 ]; then
    return 0
  else
    return 1
  fi
}

# ── Local (venv) mode ──────────────────────────────────────
start_local() {
  if ! check_python_version; then
    echo "❌ Rasa 3.6.x requires Python >=3.8,<3.11"
    echo "   Your Python version: $(python3 --version 2>/dev/null || echo 'not found')"
    echo ""
    echo "   Options:"
    echo "   1. Run: ./start.sh docker    (recommended)"
    echo "   2. Install Python 3.10 via pyenv/deadsnakes and retry"
    exit 1
  fi

  # Python venv setup (first time)
  if [ ! -d ".venv" ]; then
    echo "⚙️  Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install rasa==3.6.21 rasa-sdk==3.6.2
  else
    source .venv/bin/activate
  fi

  local SUB_MODE="${1:-all}"

  case "$SUB_MODE" in
    actions)
      start_actions
      wait
      ;;
    rasa)
      start_rasa_server
      wait
      ;;
    all|*)
      start_actions
      start_rasa_server
      echo ""
      echo "✅ Calisto NLP services running:"
      echo "   • Rasa REST API  → http://localhost:5005"
      echo "   • Action Server  → http://localhost:5055"
      echo ""
      echo "   POST messages to: http://localhost:5005/webhooks/rest/webhook"
      echo "   Press Ctrl+C to stop."
      wait
      ;;
  esac
}

start_actions() {
  echo "🚀 Starting Calisto Action Server on port 5055..."
  HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 rasa run actions --actions actions.actions --port 5055 &
  ACTION_PID=$!
  echo "   Action server PID: $ACTION_PID"
  sleep 3
}

start_rasa_server() {
  echo "🤖 Starting Calisto Rasa NLP Server on port 5005..."
  rasa run \
    --enable-api \
    --cors "*" \
    --endpoints endpoints.yml \
    --credentials credentials.yml \
    --port 5005 &
  RASA_PID=$!
  echo "   Rasa server PID: $RASA_PID"
}

# ── Main ───────────────────────────────────────────────────
case "$MODE" in
  docker)
    start_docker
    ;;
  local|actions|rasa)
    start_local "$MODE"
    ;;
  auto|all|*)
    # Auto-detect: use Docker if python is incompatible
    if check_python_version; then
      echo "📦 Compatible Python found, using local mode..."
      start_local "all"
    elif command -v docker &>/dev/null && command -v docker compose &>/dev/null; then
      echo "🐳 Python not compatible with Rasa, using Docker..."
      start_docker
    else
      echo "❌ Cannot start Calisto NLP:"
      echo "   • Python $(python3 --version 2>&1) is not compatible (need 3.8–3.10)"
      echo "   • Docker is not installed"
      echo ""
      echo "   Please install Docker or Python 3.10, then retry."
      exit 1
    fi
    ;;
esac
