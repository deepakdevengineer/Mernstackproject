# ==========================================
# Stage 1: Build/Install dependencies
# ==========================================
FROM python:3.10-slim AS builder

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies to a local directory
RUN pip install --no-cache-dir --user -r requirements.txt

# ==========================================
# Stage 2: Production release
# ==========================================
FROM python:3.10-slim AS runner

WORKDIR /usr/src/app

# Create non-root system group and user
RUN groupadd -g 10001 worker && \
    useradd -u 10001 -g worker -m -s /bin/bash worker

# Copy installed pip modules from builder
COPY --from=builder /root/.local /home/worker/.local
COPY --from=builder /usr/src/app /usr/src/app

COPY main.py .

# Add local path to PATH env for python modules
ENV PATH=/home/worker/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

# Change ownership of app files to non-root user
RUN chown -R worker:worker /usr/src/app

USER worker

CMD ["python", "main.py"]
