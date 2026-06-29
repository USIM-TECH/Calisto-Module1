#!/bin/bash
cd "$(dirname "$0")"

# Load environment variables from .env file, handling values with spaces
set -a
source .env
set +a

# Start the Rasa action server
.venv/bin/rasa run actions --actions actions.actions --port 5055
