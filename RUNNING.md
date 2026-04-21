# Running Calisto Eyewear Chatbot (Native Mode)

To ensure maximum performance and stability on Mac M1/M2 (ARM64) hardware, this project utilizes a **Native Host Execution** model. This avoids the latency and connection issues found in Docker emulation.

## 🚀 Quick Start (Recommended)

The easiest way to start all services is using the provided automation script:

1.  **Open Terminal** in the `calisto_nlp_export` directory.
2.  **Start Services**:
    ```bash
    ./start_services.sh
    ```
    *This will start Rasa (5015), Action Server (5055), Reasoning Server (8000), and the Integration Layer (3000) in the background.*

3.  **Stop Services**:
    ```bash
    ./stop_services.sh
    ```

---

## 🛠 Manual Execution (Step-by-Step)

If you need to debug or prefer manual control, follow these steps:

### 1. Start Ollama
Ensure [Ollama](https://ollama.com/download) is running and the model is downloaded:
```bash
ollama run llama3.2:3b
```

### 2. Action Server (Port 5055)
```bash
cd calisto_nlp_export
source .venv/bin/activate
rasa run actions --port 5055
```

### 3. Rasa Server (Port 5015)
```bash
cd calisto_nlp_export
source .venv/bin/activate
rasa run --enable-api --cors "*" --endpoints endpoints.yml --credentials credentials.yml --port 5015
```

### 4. Reasoning Service (Port 8000)
```bash
cd calisto_nlp_export
export PYTHONPATH=$PYTHONPATH:.
./.venv_reasoning/bin/uvicorn reasoning_service.server:app --host 0.0.0.0 --port 8000
```

### 5. Integration Layer (Port 3000)
```bash
cd chatbot-integrations
npm run dev
```

---

## 📝 Troubleshooting & Logs

Each service writes its own log file in the `calisto_nlp_export` directory:
*   `rasa_server.log`: Rasa core engine status.
*   `action_server.log`: Custom Rasa actions (search, lead capture).
*   `reasoning_server.log`: LLM intent/emotion analysis and rewriting.
*   `../chatbot-integrations/integration_server.log`: Integration layer logs.

If you encounter `ECONNRESET` or `Connection reset by peer`, ensure **NO** Docker containers are running for these services.
