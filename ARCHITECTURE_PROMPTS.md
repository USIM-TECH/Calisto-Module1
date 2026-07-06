# Architecture Diagram Generation Prompts

Use these prompts with ChatGPT's image generation (DALL-E) or similar tools to create professional AWS architecture diagrams for different deployment scales.

---

## Tier 1: 100 Concurrent Users (Single EC2)

```
Create a professional AWS architecture diagram for a chatbot deployment supporting 100 concurrent users.

Layout (left to right):
- Left side: User input channels (WhatsApp, Instagram, Messenger, Telegram, X icons) flowing into a web browser icon
- Center-left: AWS WAF (Web Application Firewall) icon in a circle, connected to Nginx reverse proxy box with "Let's Encrypt SSL" label
- Center: Single large EC2 instance box (t3.large, 2 vCPU, 8 GB RAM) containing 5 stacked service boxes:
  * Node.js Express API (port 3000) - gray box with Node.js logo
  * Rasa NLU server (port 5015) - gray box with Rasa logo
  * Rasa action server (port 5055) - gray box
  * Reasoning engine (port 8008) - gray box
  * Ollama LLM service (port 11434) - gray box with llama icon
- Center-right: AWS RDS PostgreSQL icon (blue database cylinder) labeled "db.t3.micro" in a private subnet box
- Right side: AWS CloudWatch icon, AWS Secrets Manager icon

Connections: Blue arrows showing data flow from users → WAF → Nginx → EC2 services → RDS. Dashed lines indicating private connections.

Style: Clean, professional, modern AWS architecture diagram style with official AWS service icons, light gray background, blue connection arrows, labeled ports and services. Include cost indicator: ~$49/mo (1-yr Savings Plan).
```

---

## Tier 2: 500 Concurrent Users (Multi-EC2 with ALB)

```
Create a professional AWS architecture diagram for a chatbot deployment supporting 500 concurrent users with high availability.

Layout (left to right):
- Left side: User input channels (WhatsApp, Instagram, Messenger, Telegram, X icons) flowing into a web browser icon
- Center-left: AWS WAF (Web Application Firewall) icon, connected to AWS Application Load Balancer (ALB) with "SSL/TLS Termination" label
- Center: Two EC2 instance boxes side-by-side (each t3.xlarge, 4 vCPU, 16 GB RAM) in an Auto Scaling Group, each containing 5 stacked service boxes:
  * Node.js Express API (port 3000)
  * Rasa NLU server (port 5015)
  * Rasa action server (port 5055)
  * Reasoning engine (port 8008)
  * Ollama LLM service (port 11434)
- Center-right: AWS RDS PostgreSQL icon (blue database cylinder) labeled "db.t3.medium" in a private subnet box with Multi-AZ failover indicator
- Right side: AWS CloudWatch icon, AWS Secrets Manager icon, AWS Auto Scaling icon

Connections: Blue arrows showing data flow from users → WAF → ALB → EC2 instances (with load balancing arrows) → RDS. Dashed lines indicating private connections. Show health check arrows from ALB to EC2 instances.

Style: Clean, professional, modern AWS architecture diagram style with official AWS service icons, light gray background, blue connection arrows, labeled ports and services. Include cost indicator: ~$130/mo (1-yr Savings Plan). Show "Auto Scaling Group" label.
```

---

## Tier 3: 1000+ Concurrent Users (Enterprise with ElastiCache)

```
Create a professional AWS architecture diagram for an enterprise chatbot deployment supporting 1000+ concurrent users with caching and high availability.

Layout (left to right):
- Left side: User input channels (WhatsApp, Instagram, Messenger, Telegram, X icons) flowing into a web browser icon
- Center-left: AWS WAF (Web Application Firewall) icon, connected to AWS Application Load Balancer (ALB) with "SSL/TLS Termination" label
- Center: Three EC2 instance boxes (each c5a.2xlarge, 8 vCPU, 16 GB RAM) in an Auto Scaling Group, each containing 5 stacked service boxes:
  * Node.js Express API (port 3000)
  * Rasa NLU server (port 5015)
  * Rasa action server (port 5055)
  * Reasoning engine (port 8008)
  * Ollama LLM service (port 11434)
- Center-right: AWS ElastiCache Redis cluster icon (red Redis logo) labeled "Redis Cluster" for session caching and rate limiting
- Right side: AWS RDS PostgreSQL icon (blue database cylinder) labeled "db.r6i.xlarge Multi-AZ" in a private subnet box with Multi-AZ failover indicator
- Far right: AWS CloudWatch icon, AWS Secrets Manager icon, AWS Auto Scaling icon, AWS CloudFront icon

Connections: Blue arrows showing data flow from users → WAF → ALB → EC2 instances (with load balancing arrows) → Redis cache and RDS. Dashed lines indicating private connections. Show health check arrows from ALB to EC2 instances. Show CloudFront CDN edge locations.

Style: Clean, professional, modern AWS architecture diagram style with official AWS service icons, light gray background, blue connection arrows, labeled ports and services. Include cost indicator: ~$400-500/mo (1-yr Savings Plan). Show "Auto Scaling Group" label and "Multi-AZ" indicators.
```

---

## Development/Testing: Local Docker Setup

```
Create a professional architecture diagram for a local development environment of a chatbot system using Docker Compose.

Layout (left to right):
- Left side: Developer laptop icon with "Local Machine" label
- Center: Large Docker container box containing 6 service boxes stacked vertically:
  * Node.js Express API (port 3000) - gray box with Node.js logo
  * Rasa NLU server (port 5015) - gray box with Rasa logo
  * Rasa action server (port 5055) - gray box
  * Reasoning engine (port 8008) - gray box
  * Ollama LLM service (port 11434) - gray box with llama icon
  * PostgreSQL database (port 5432) - blue database icon
- Bottom: Redis cache icon (port 6379)
- Right side: Localhost URLs listed (http://localhost:3000, http://localhost:5015, etc.)

Connections: Arrows showing inter-service communication within Docker network. Show volume mounts for persistent data.

Style: Clean, professional diagram with Docker logo prominent, light gray background, blue connection arrows. Include note: "All services run locally in Docker Compose for development and testing."
```

---

## Claude Prompt for Official Documentation

Use this prompt with Claude to convert the deployment_guide.md into professional documentation with placeholder spaces for architecture diagrams:

```
Convert the following Markdown deployment guide into professional, publication-ready documentation with the following requirements:

1. Structure:
   - Add a professional title page with metadata (version, date, author, confidentiality level)
   - Create a table of contents with page numbers
   - Add executive summary (1-2 pages) highlighting key benefits and cost savings
   - Maintain all existing sections but reorganize for better flow

2. Architecture Diagrams:
   - After "System Architecture Overview" section: Add placeholder "[INSERT ARCHITECTURE DIAGRAM: 100 Concurrent Users]"
   - After "Capacity Planning" section: Add placeholders for:
     * "[INSERT ARCHITECTURE DIAGRAM: 500 Concurrent Users - Multi-EC2 with ALB]"
     * "[INSERT ARCHITECTURE DIAGRAM: 1000+ Concurrent Users - Enterprise Setup]"
   - After "EC2 Deployment Instructions" section: Add placeholder "[INSERT ARCHITECTURE DIAGRAM: Local Development Setup]"

3. Formatting:
   - Use professional typography (headers, subheaders, consistent styling)
   - Convert all code blocks to formatted code sections with syntax highlighting indicators
   - Add page breaks between major sections
   - Number all figures and tables with captions
   - Add footnotes for technical references

4. Content Enhancements:
   - Add a "Key Assumptions" section at the beginning
   - Add a "Limitations & Constraints" section
   - Add a "Troubleshooting" appendix
   - Add a "Glossary" of AWS and technical terms
   - Add "Quick Reference" cards for common commands

5. Visual Elements:
   - Add callout boxes for "Important", "Warning", and "Tip" sections
   - Create comparison tables with better formatting
   - Add decision trees for choosing between options (ALB vs Nginx, Ollama vs vLLM)

6. Output Format:
   - Generate as a structured document outline with clear section markers
   - Include markdown formatting that can be converted to PDF/Word
   - Maintain all technical accuracy and code examples
   - Ensure all links and references are preserved

The goal is to create a professional, enterprise-grade deployment guide suitable for stakeholder review and team distribution.
```

---

## How to Use These Prompts

1. **For Architecture Diagrams:**
   - Copy the relevant tier prompt
   - Paste into ChatGPT's image generation (DALL-E)
   - Generate the image
   - Save with naming convention: `architecture-diagram-{tier}.png`
   - Example: `architecture-diagram-100-users.png`, `architecture-diagram-500-users.png`

2. **For Official Documentation:**
   - Copy the Claude prompt
   - Paste into Claude (claude.ai)
   - Provide the deployment_guide.md content
   - Request Claude to generate the structured documentation
   - Export as markdown or request PDF conversion

3. **Integration:**
   - Replace placeholders in the generated documentation with the actual diagram images
   - Use the diagram images in presentations, wikis, and team documentation
