FROM python:3.12-slim

LABEL maintainer="ServerSphere"
LABEL description="Multi-VPS Management Dashboard"

# Install system deps for SSH
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend files
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/*.py .

# Copy frontend into backend/frontend/ (FastAPI serves it from there)
COPY backend/frontend/ ./frontend/

# Data volume for persistent VPS configs
VOLUME /app/data

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--ws-ping-interval", "30"]
