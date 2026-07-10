# ============================================================
# Calisto Eyewear – Rasa NLP Dockerfile
# ============================================================
# Rasa 3.6.x requires Python >=3.8,<3.11
# Using the official Rasa image which bundles everything needed.
# ============================================================

FROM rasa/rasa:3.6.21

# Suppress SQLAlchemy 2.0 and pkg_resources warnings
ENV SQLALCHEMY_SILENCE_UBER_WARNING=1
ENV PYTHONWARNINGS=ignore
ENV PYTHONDONTWRITEBYTECODE=1

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

# Create a startup wrapper script that suppresses stderr warnings
RUN echo '#!/bin/bash' > /app/start.sh && \
    echo 'exec rasa "$@" 2>/dev/null' >> /app/start.sh && \
    chmod +x /app/start.sh

# Switch back to non-root user
USER 1001

# Expose the Rasa REST API port
EXPOSE 5005

# Use wrapper script to suppress warnings
ENTRYPOINT ["/app/start.sh"]
CMD ["run", "--enable-api", "--cors", "*", "--endpoints", "endpoints.docker.yml", "--credentials", "credentials.yml", "--port", "5005"]
