# Stage 1: Build BChemXtract JAR
FROM maven:3.9-eclipse-temurin-21 AS jar-builder
WORKDIR /build
# Clone directly from GitHub to avoid git submodule issues in Docker context
# Pinned to v1.0 tag for reproducible builds (T-01-02 mitigation)
RUN git clone --branch v1.0 --depth 1 https://github.com/Beilstein-Institut/BChemXtract.git bchemxtract
RUN cd bchemxtract && mvn clean package -DskipTests -q

# Stage 2: Install Python dependencies with uv
FROM python:3.12-slim AS python-builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=backend/uv.lock,target=uv.lock \
    --mount=type=bind,source=backend/pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

# Stage 3: Runtime
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-21-jdk-headless curl \
    libharfbuzz0b libfreetype6 fontconfig fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
WORKDIR /app

# Copy Python virtual environment from builder
COPY --from=python-builder /app/.venv /app/.venv

# Copy built JAR from Maven stage
COPY --from=jar-builder /build/bchemxtract/target/*-jar-with-dependencies.jar /app/jars/

# Copy application code
COPY backend/app /app/app
COPY backend/alembic /app/alembic
COPY backend/alembic.ini /app/alembic.ini

# Set PATH to use the virtual environment
ENV PATH="/app/.venv/bin:$PATH"
ENV JAR_PATH=/app/jars

# Run as non-root user (T-01-05 mitigation)
RUN useradd -r -u 1001 -s /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
