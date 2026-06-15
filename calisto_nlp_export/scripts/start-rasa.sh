#!/bin/sh
set -eu

MODEL_PATH="${RASA_MODEL_PATH:-}"

if [ -z "$MODEL_PATH" ]; then
  MODEL_PATH="$(find /app/models -maxdepth 1 -type f -name '*.tar.gz' | sort | tail -n 1 || true)"
fi

if [ -z "$MODEL_PATH" ]; then
  echo "No Rasa model archive found in /app/models" >&2
  exit 1
fi

echo "Starting Rasa with model: $MODEL_PATH"

exec rasa run \
  --model "$MODEL_PATH" \
  --enable-api \
  --cors "*" \
  --endpoints endpoints.docker.yml \
  --credentials credentials.yml \
  --port 5015 \
  --num-threads 4
