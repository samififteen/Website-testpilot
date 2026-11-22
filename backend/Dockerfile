# ---- TestPilot AI backend (FastAPI + Playwright/Chromium) ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TESTPILOT_DATABASE_URL=sqlite:////data/testpilot.db \
    TESTPILOT_SCREENSHOT_DIR=/data/screenshots \
    TESTPILOT_REPORT_DIR=/data/reports

WORKDIR /app

# Runtime libraries for headless Chromium plus curl for health checks.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Install Chromium and only the browser dependencies it needs (runs as root here,
# the application itself never does).
RUN python -m playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY app ./app

RUN useradd --create-home --uid 10001 testpilot \
    && mkdir -p /data/screenshots /data/reports /app/data \
    && chown -R testpilot:testpilot /app /data /ms-playwright

USER testpilot
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
