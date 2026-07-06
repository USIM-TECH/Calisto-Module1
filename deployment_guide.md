# Calisto Backend — AWS Production Deployment & Architecture Guide

This guide details the complete production architecture, provisioning steps, configuration options, cost estimations, and performance tuning configurations for deploying the Calisto chatbot backend on AWS.

---

## 1. System Architecture Overview

For a detailed visual diagram prompt and data flow explanation, see [ARCHITECTURE_DIAGRAM.md](ARCHITECTURE_DIAGRAM.md).

```
                          Internet (Meta Webhooks, Telegram, X, Webchat)
                                       │
                                       ▼
                       [Application Load Balancer (ALB) / Nginx]
                                  (SSL/HTTPS Termination)
                                       │
                                       ▼
                         [EC2 Instance — Ubuntu 22.04]
            ┌─────────────────────────────────────────────────────────┐
            │ Docker Compose Environment                              │
            │  ├── chatbot-integrations  (Node.js API, port 3000)      │
            │  ├── rasa                  (NLP/NLU, port 5015)         │
            │  ├── action-server         (Custom Actions, port 5055)  │
            │  ├── reasoning-server      (Reasoning Engine, port 8008)│
            │  └── ollama                (LLM fallback, port 11434)   │
            │        └─ Persistent Volume (ollama-data)               │
            └─────────┬───────────────────────────────────────────────┘
                      │
                      ▼
            [AWS RDS — PostgreSQL 16] (Private Subnet)
```

---

## 2. Infrastructure Setup & Provisioning

### Step A: AWS RDS (PostgreSQL 16)
1. **Engine**: PostgreSQL 16.
2. **Template**: Production (Multi-AZ is recommended for high availability, but optional).
3. **Instance Size**: `db.t3.medium` (2 vCPU, 4 GB RAM) is a solid baseline.
4. **Storage**: 20 GB gp3 with autoscaling enabled.
5. **Connectivity**: Place in **private subnets** within your VPC. Disable public accessibility.
6. **Security Group**: Configure the DB security group to allow inbound traffic on **port 5432** *only* from the EC2 Instance Security Group.

### Step B: EC2 Instance
1. **Operating System**: **Ubuntu Server 22.04 LTS**.
2. **Instance Size (100 concurrent users)**:
   * **Recommended**: `t3.large` (2 vCPU, 8 GB RAM) — sufficient for Rasa + Node.js API + action server at this concurrency level. Ollama (`llama3.2:3b` ~2 GB RAM) fits comfortably alongside the other services.
   * **Upgrade path**: If p99 latency degrades under sustained load, move to `t3.xlarge` (4 vCPU, 16 GB RAM) without any config changes.
3. **Storage**: Allocate at least **30 GB gp3** storage (Docker cache, Rasa models, and LLM weights).
4. **Elastic IP**: Allocate and associate an Elastic IP to the instance so that the public-facing IP remains static upon server restarts.
5. **Security Group**: Inbound Rules:
   | Protocol / Port | Source | Description |
   |:---|:---|:---|
   | SSH (22) | Your Trusted IP range | Secure access |
   | HTTP (80) | `0.0.0.0/0` | Redirect to HTTPS / Let's Encrypt |
   | HTTPS (443) | `0.0.0.0/0` | Webhook target endpoint |

---

## 3. Concurrency & Performance Tuning (Pre-configured)

To support concurrent chatting across all five channels (WhatsApp, Instagram, Messenger, Telegram, X), the following optimizations have been implemented in your project codebase:

### A. Rasa NLU Concurrency
By default, Rasa runs with a single worker thread, which queues incoming requests sequentially. 
* **Fix**: Rasa is configured to run with multiple threads (`--num-threads 4`).
* **Location**: Configured in [start.sh](file:///Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export/start.sh#L109-L118) (local) and [scripts/start-rasa.sh](file:///Users/aswanthb/Documents/GitHub/Calisto-Module1/calisto_nlp_export/scripts/start-rasa.sh) (Docker).

### B. Ollama Concurrency & Performance
Since the fallback classifier utilizes a local Llama model via Ollama, parallel slots have been configured to prevent queue blocking:
* `OLLAMA_NUM_PARALLEL: 1` (Single concurrent LLM completion — sufficient for 100 users since LLM is only the fallback path; keeps RAM usage low on `t3.large`).
* `OLLAMA_MAX_QUEUE: 3` (Queues up to 3 additional requests before returning busy errors).
* `OLLAMA_KEEP_ALIVE: "10m"` (Keeps the model hot in system memory/RAM for 10 minutes between requests, avoiding a 10-second reload latency).
* **Location**: Defined in [docker-compose.yml](file:///Users/aswanthb/Documents/GitHub/Calisto-Module1/docker-compose.yml#L115-L127).

### C. Deduplication
Meta and other messaging channels regularly retry webhook payloads if a response is not received within 2-3 seconds. The integration layer has built-in deduplication (configured via `DEDUP_TTL_MS`) to ignore duplicate payloads while a thread is already processing the response.

---

## 4. Serving LLMs on EC2: Ollama vs. vLLM

We discussed serving engines for the fallback LLM layer (`llama3` or `llama3.2:3b`).

### Where the Ollama model files live:
Inside your Docker Compose configuration, Ollama mounts a named volume:
```yaml
volumes:
  - ollama-data:/root/.ollama
```
On your EC2 host machine, these model weights are stored persistently under:
`/var/lib/docker/volumes/<project_directory_name>_ollama-data/_data/`

### Ollama vs. vLLM Comparison:
* **Stick with Ollama (CPU serving)** if you deploy on CPU-only instances (like `c5a.xlarge`). It is powered by `llama.cpp` under the hood, making it highly optimized for running quantized models (GGUF formats) on system RAM/CPU.
* **Switch to vLLM (GPU serving)** if you scale to GPU instances (like `g4dn.xlarge` with NVIDIA T4). vLLM is designed for high-concurrency server hosting using GPU memory virtualization (PagedAttention) and continuous batching. It is overkill and performs poorly on standard CPU-only instances.
* *Note: Since Ollama and vLLM both expose OpenAI-compatible chat endpoints, switching from Ollama to vLLM in the future requires only changing the `OLLAMA_URL` env variable.*

---

## 5. Capacity Planning & AWS Cost Estimation (100 Concurrent Users)

| Resource | Spec | On-Demand | 1-yr Savings Plan |
|:---|:---|:---|:---|
| EC2 `t3.large` | 2 vCPU, 8 GB RAM | ~$60/mo | ~$38/mo |
| RDS `db.t3.micro` | 2 vCPU, 1 GB RAM | ~$15/mo | ~$10/mo |
| Data Transfer (outbound ~10 GB) | — | ~$1/mo | ~$1/mo |
| Elastic IP | Attached to running instance | Free | Free |
| **Estimated Total** | | **~$76/mo** | **~$49/mo** |

**Notes:**
* `db.t3.micro` handles 100 concurrent users comfortably for this workload (short-lived chatbot queries, not heavy analytics). Upgrade to `db.t3.medium` if you observe connection pool exhaustion.
* The 1-year Savings Plan (~35% discount) is the most cost-effective commitment for a stable production workload.
* No ALB is needed at this scale — Nginx on the EC2 instance handles SSL termination (see Section 7, Option B).
* **Upgrade trigger**: If CPU consistently exceeds 70% or free memory drops below 1 GB, move to `t3.xlarge` (~$120/mo On-Demand, ~$76/mo Savings Plan).

---

## 6. EC2 Deployment Instructions 

### Step 1: Install Docker and Git on EC2
Once logged into your EC2 instance via SSH:
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# Verify installations
docker --version
docker compose version
```

### Step 2: Clone Code and Prepare Environments
```bash
git clone https://github.com/USIM-TECH/Calisto-Module1.git
cd Calisto-Module1
```

Create your production configuration `.env` in the root folder:
```bash
nano .env
```
Fill in the credentials as outlined:
```env
PORT=3000
PUBLIC_BASE_URL=https://your-domain-or-elastic-ip.com
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://calisto:<PASSWORD>@<RDS_ENDPOINT>:5432/calisto_chatbot?sslmode=require

# NLP URLs
RASA_URL=http://rasa:5015
REASONING_URL=http://reasoning-server:8008

# LLM Config
LLM_LAYER_ENABLED=true
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2:3b

# Channel Secrets (WhatsApp, Instagram, Telegram, Messenger, X)
# ...
```

Create a production override file to run Ollama outside the default `llm` profile and turn off the local postgres database:
```bash
nano docker-compose.override.yml
```
Paste the following:
```yaml
version: '3.8'

services:
  # Disable local postgres container (using AWS RDS instead)
  postgres:
    profiles:
      - local-only

  integration:
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL}
      STORAGE_BACKEND: postgres

  rasa:
    restart: unless-stopped

  action-server:
    restart: unless-stopped

  reasoning-server:
    restart: unless-stopped

  ollama:
    profiles: [] # Bring Ollama into default active profile
    restart: unless-stopped
```

### Step 3: Run Database Migrations
Run your Prisma database migrations against your RDS instance using a temporary migration container:
```bash
docker compose run --rm integration npm run db:migrate
docker compose run --rm integration npm run db:seed:products
docker compose run --rm integration npm run db:seed:knowledge
```

### Step 4: Run Ollama & Download LLM Weights
Start the Ollama service container first:
```bash
docker compose up -d ollama
```
Pull the required model weights into the persistent Docker volume:
```bash
docker compose exec ollama ollama pull llama3.2:3b
```
Verify the model downloaded correctly:
```bash
docker compose exec ollama ollama list
```

### Step 5: Start the Backend Cluster
Launch all other containers in detached mode:
```bash
docker compose up -d
```
Check status:
```bash
docker compose ps
docker compose logs -f integration
```

---

## 7. Configuring Webhooks for Production

Meta APIs (Instagram, WhatsApp, Messenger) require an **HTTPS/SSL endpoint** for webhook verification. You have two primary methods to enable HTTPS:

### Option A: SSL Termination via AWS ALB (Recommended for Multi-Node)
Place an AWS Application Load Balancer in front of your EC2 instances. You can generate a free SSL certificate using **AWS Certificate Manager (ACM)** and attach it to the ALB. Forward port 443 traffic from the ALB to port 3000 on your EC2 instance.

### Option B: Let's Encrypt + Nginx (Recommended for Single-Node Setup)
If you have a domain pointing to your EC2 Elastic IP:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/calisto
```
Configure Nginx to reverse proxy to port 3000:
```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Link and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/calisto /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
Obtain and bind your SSL certificate:
```bash
sudo certbot --nginx -d yourdomain.com
```

Your production webhooks will then reside at `https://yourdomain.com/webhooks/<channel>`.
