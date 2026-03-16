# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python app ───────────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Install Python dependencies
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY backend/ ./backend/
COPY main.py ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/build ./frontend/build

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
