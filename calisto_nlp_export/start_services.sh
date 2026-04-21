#!/bin/bash
PROJECT_ROOT="/Users/aswanthb/Documents/GitHub/Calisto-Module1"
NLP_DIR="$PROJECT_ROOT/calisto_nlp_export"
INTEGRATION_DIR="$PROJECT_ROOT/chatbot-integrations"

echo "Starting Calisto Native Stack..."

cd "$NLP_DIR"

# 1. Action Server
echo "Starting Action Server on port 5055..."
source .venv/bin/activate
rasa run actions --port 5055 > action_server.log 2>&1 &
sleep 5

# 2. Rasa Server
echo "Starting Rasa Server on port 5015..."
rasa run --enable-api --cors "*" --endpoints endpoints.yml --credentials credentials.yml --port 5015 > rasa_server.log 2>&1 &
sleep 15

# 3. Reasoning Server
echo "Starting Reasoning Server on port 8000..."
export PYTHONPATH=$PYTHONPATH:.
./.venv_reasoning/bin/uvicorn reasoning_service.server:app --host 0.0.0.0 --port 8000 > reasoning_server.log 2>&1 &
sleep 5

# 4. Integration Layer
echo "Starting Integration Layer on port 3000..."
cd "$INTEGRATION_DIR"
npm run dev > integration_server.log 2>&1 &

echo "Services are starting in the background."
echo "Check logs (*.log) for progress."
