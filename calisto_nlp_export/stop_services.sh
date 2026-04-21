#!/bin/bash

# Port definitions
RASA_PORT=5015
ACTION_PORT=5055
REASONING_PORT=8000
INTEGRATION_PORT=3000

echo "Stopping Calisto Services..."

# Function to kill process on port
kill_port() {
    local port=$1
    local name=$2
    pid=$(lsof -t -i :$port)
    if [ -n "$pid" ]; then
        echo "Stopping $name (PID: $pid) on port $port..."
        kill $pid
    else
        echo "$name is not running on port $port."
    fi
}

kill_port $ACTION_PORT "Action Server"
kill_port $RASA_PORT "Rasa Server"
kill_port $REASONING_PORT "Reasoning Server"
kill_port $INTEGRATION_PORT "Integration Layer"

# Also kill any leftover node TSX processes if needed
# kill $(ps aux | grep 'src/app/server.ts' | grep -v grep | awk '{print $2}') 2>/dev/null

echo "All services stopped."
