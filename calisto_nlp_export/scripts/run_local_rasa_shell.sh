#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_ENV="${CALISTO_RASA_ENV_DIR:-${TMPDIR:-/tmp}/calisto-rasa310}"
SHELL_PORT="${CALISTO_SHELL_PORT:-5006}"
ACTION_PORT="${CALISTO_ACTION_PORT:-5055}"
ACTION_LOG="${CALISTO_ACTION_LOG:-${TMPDIR:-/tmp}/calisto-action-server.log}"

RASA_VERSION="3.6.21"
RASA_SDK_VERSION="3.6.2"
TRANSFORMERS_VERSION="4.39.3"
TOKENIZERS_VERSION="0.15.2"

ACTION_STARTED_BY_SCRIPT=0
ACTION_PID=""

find_python_310() {
  if [[ -n "${CALISTO_RASA_PYTHON:-}" && -x "${CALISTO_RASA_PYTHON}" ]]; then
    printf '%s\n' "$CALISTO_RASA_PYTHON"
    return 0
  fi

  local candidate
  for candidate in python3.10 /opt/homebrew/bin/python3.10 /usr/local/bin/python3.10; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done

  return 1
}

ensure_env() {
  if [[ ! -x "$TEMP_ENV/bin/python" ]]; then
    local py310
    py310="$(find_python_310)" || {
      echo "Python 3.10 is required to run Rasa 3.6 locally." >&2
      echo "Install python3.10 or set CALISTO_RASA_PYTHON to a Python 3.10 executable." >&2
      exit 1
    }

    "$py310" -m venv "$TEMP_ENV"
  fi
}

package_version() {
  local package_name="$1"
  "$TEMP_ENV/bin/python" - <<'PY' "$package_name"
from importlib import metadata
import sys

name = sys.argv[1]
try:
    print(metadata.version(name))
except metadata.PackageNotFoundError:
    print("")
PY
}

ensure_dependencies() {
  local rasa_version rasa_sdk_version transformers_version tokenizers_version
  rasa_version="$(package_version rasa)"
  rasa_sdk_version="$(package_version rasa-sdk)"
  transformers_version="$(package_version transformers)"
  tokenizers_version="$(package_version tokenizers)"

  if [[ "$rasa_version" != "$RASA_VERSION" || "$rasa_sdk_version" != "$RASA_SDK_VERSION" || "$transformers_version" != "$TRANSFORMERS_VERSION" || "$tokenizers_version" != "$TOKENIZERS_VERSION" ]]; then
    "$TEMP_ENV/bin/pip" install --upgrade pip
    "$TEMP_ENV/bin/pip" install \
      "rasa==$RASA_VERSION" \
      "rasa-sdk==$RASA_SDK_VERSION" \
      -r "$PROJECT_DIR/requirements.actions.txt"
    "$TEMP_ENV/bin/pip" install \
      "transformers==$TRANSFORMERS_VERSION" \
      "tokenizers==$TOKENIZERS_VERSION" \
      "huggingface-hub<1.0"
  fi
}

pick_model() {
  local model_path
  model_path="$(ls -t "$PROJECT_DIR"/models/*.tar.gz 2>/dev/null | head -n 1 || true)"

  if [[ -z "$model_path" ]]; then
    echo "No trained model archive was found under $PROJECT_DIR/models." >&2
    echo "Train a model first with: rasa train" >&2
    exit 1
  fi

  printf '%s\n' "$model_path"
}

port_open() {
  local port="$1"
  python3 - <<'PY' "$port"
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket()
sock.settimeout(1)
try:
    sock.connect(("127.0.0.1", port))
except OSError:
    raise SystemExit(1)
finally:
    sock.close()
PY
}

wait_for_port() {
  local port="$1"
  local attempts="${2:-60}"
  local delay_secs="${3:-1}"
  local i

  for ((i=1; i<=attempts; i++)); do
    if port_open "$port"; then
      return 0
    fi
    sleep "$delay_secs"
  done

  return 1
}

cleanup() {
  if [[ "$ACTION_STARTED_BY_SCRIPT" -eq 1 && -n "$ACTION_PID" ]]; then
    kill "$ACTION_PID" >/dev/null 2>&1 || true
  fi
}

start_action_server_if_needed() {
  if port_open "$ACTION_PORT"; then
    echo "Using existing action server on port $ACTION_PORT."
    return 0
  fi

  echo "Starting action server on port $ACTION_PORT..."
  (
    cd "$PROJECT_DIR"
    KB_DB_HOST="${KB_DB_HOST:-localhost}" \
    KB_DB_PORT="${KB_DB_PORT:-5432}" \
    KB_DB_NAME="${KB_DB_NAME:-calisto_kb}" \
    KB_DB_USER="${KB_DB_USER:-calisto}" \
    KB_DB_PASSWORD="${KB_DB_PASSWORD:-calisto}" \
    "$TEMP_ENV/bin/rasa" run actions --actions actions.actions --port "$ACTION_PORT"
  ) >"$ACTION_LOG" 2>&1 &

  ACTION_PID="$!"
  ACTION_STARTED_BY_SCRIPT=1

  if ! wait_for_port "$ACTION_PORT" 60 1; then
    echo "Action server failed to start. Check log: $ACTION_LOG" >&2
    exit 1
  fi

  echo "Action server ready. Log: $ACTION_LOG"
}

main() {
  trap cleanup EXIT

  ensure_env
  ensure_dependencies
  start_action_server_if_needed

  local model_path
  model_path="$(pick_model)"

  echo "Launching Rasa shell with model: $model_path"
  echo "Shell port: $SHELL_PORT"

  cd "$PROJECT_DIR"
  exec "$TEMP_ENV/bin/rasa" shell \
    --port "$SHELL_PORT" \
    -m "$model_path" \
    --endpoints "$PROJECT_DIR/endpoints.yml"
}

main "$@"