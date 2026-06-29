# ============================================================
# Calisto Eyewear – Rasa NLP Dockerfile
# ============================================================
# Rasa 3.6.x requires Python >=3.8,<3.11
# Using the official Rasa image which bundles everything needed.
# ============================================================

FROM rasa/rasa:3.6.21

# Switch to root to install custom action dependencies
USER root

# Copy project files
WORKDIR /app

COPY config.yml .
COPY domain.yml .
COPY endpoints.yml .
COPY endpoints.docker.yml .
COPY credentials.yml .
COPY data/ ./data/
COPY actions/ ./actions/
COPY forms/ ./forms/
COPY search/ ./search/
COPY config/ ./config/
COPY nlp/ ./nlp/
COPY gateway/ ./gateway/
COPY cache/ ./cache/

# Switch back to non-root user
USER 1001

# Expose the Rasa REST API port
EXPOSE 5005

# Run Rasa with the REST API enabled
CMD ["run", "--enable-api", "--cors", "*", "--endpoints", "endpoints.docker.yml", "--credentials", "credentials.yml", "--port", "5005"]
