# Calisto Architecture Diagram Prompt

## Visual Diagram Generation

Use this prompt with a diagramming tool (Lucidchart, Draw.io, Miro, or Claude's image generation) to create a professional AWS architecture diagram:

```
Create an AWS architecture diagram for a chatbot deployment supporting 100 concurrent users:

Components:
1. Internet/Users (WhatsApp, Instagram, Messenger, Telegram, X, Webchat)
2. AWS WAF (Web Application Firewall)
3. Nginx reverse proxy with Let's Encrypt SSL (on EC2)
4. EC2 Instance (t3.large, 2 vCPU, 8 GB RAM) containing:
   - Node.js Express API (chatbot-integrations, port 3000)
   - Rasa NLU server (port 5015)
   - Rasa action server (port 5055)
   - Reasoning engine (port 8008)
   - Ollama LLM service (port 11434, llama3.2:3b model)
5. AWS RDS PostgreSQL 16 (db.t3.micro, private subnet)
6. AWS Secrets Manager (for API keys and credentials)
7. CloudWatch (monitoring and logs)

Connections:
- Users → WAF → Nginx (SSL/TLS) → EC2 services
- EC2 services → RDS (private connection)
- EC2 services → Secrets Manager
- All services → CloudWatch

Style: Use AWS service icons, show data flow with arrows, highlight the single EC2 instance as the main compute resource, and indicate the private RDS connection.
```

## Alternative: Text-Based ASCII Diagram

```
                          Internet (Meta Webhooks, Telegram, X, Webchat)
                                       │
                                       ▼
                       [Nginx / Let's Encrypt SSL]
                                  (HTTPS Termination)
                                       │
                                       ▼
                         [EC2 Instance — Ubuntu 22.04]
            ┌─────────────────────────────────────────────────────────┐
            │ Docker Compose Environment (t3.large: 2 vCPU, 8 GB)     │
            │  ├── chatbot-integrations  (Node.js API, port 3000)      │
            │  ├── rasa                  (NLP/NLU, port 5015)         │
            │  ├── action-server         (Custom Actions, port 5055)  │
            │  ├── reasoning-server      (Reasoning Engine, port 8008)│
            │  └── ollama                (LLM fallback, port 11434)   │
            │        └─ Persistent Volume (ollama-data: ~2 GB)        │
            └─────────┬───────────────────────────────────────────────┘
                      │
                      ▼
            [AWS RDS — PostgreSQL 16] (Private Subnet, db.t3.micro)
```

## Data Flow

1. **Incoming Messages**: Users send messages via WhatsApp, Instagram, Messenger, Telegram, X, or Webchat
2. **SSL Termination**: Nginx on EC2 handles HTTPS/TLS encryption
3. **API Processing**: Node.js Express API receives and routes requests
4. **NLU Classification**: Rasa NLU classifies intent and extracts entities
5. **Action Execution**: Rasa action server executes business logic
6. **LLM Fallback**: Ollama provides fallback classification if Rasa confidence is low
7. **Database**: All conversation data, leads, and products stored in RDS PostgreSQL
8. **Response**: Reply sent back through the originating channel

## Cost Breakdown (100 Concurrent Users)

| Component | Cost (On-Demand) | Cost (1-yr Savings) |
|-----------|------------------|-------------------|
| EC2 t3.large | $60/mo | $38/mo |
| RDS db.t3.micro | $15/mo | $10/mo |
| Data Transfer | $1/mo | $1/mo |
| **Total** | **$76/mo** | **$49/mo** |

## Scaling Path

- **Current (100 users)**: Single t3.large EC2 + db.t3.micro RDS
- **Next (500 users)**: 2x t3.xlarge EC2 + ALB + db.t3.medium RDS
- **Enterprise (1000+ users)**: Auto-scaling group + RDS Multi-AZ + ElastiCache Redis
