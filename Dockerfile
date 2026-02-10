# Supertonic TTS API Docker Image

FROM python:3.11-slim

# Labels
LABEL maintainer="developer@example.com"
LABEL description="Supertonic TTS API - FastAPI-based REST API"
LABEL version="1.1.0"

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY src/ ./src/
COPY test_api.py .

# Create output directories
RUN mkdir -p outputs/synthesize && chmod 777 outputs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run the server
CMD ["uvicorn", "src.server:app", "--host", "0.0.0.0", "--port", "8000"]
