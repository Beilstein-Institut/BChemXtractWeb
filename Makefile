.PHONY: dev db build up down test test-backend test-frontend lint lint-fix setup clean help

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

dev:  ## Run frontend + backend locally (hybrid workflow)
	@echo "Starting backend..."
	cd backend && uv run uvicorn app.main:app --reload --port 8000 &
	@echo "Starting frontend..."
	cd frontend && npm run dev

db:  ## Start PostgreSQL via Docker (dev)
	docker compose -f docker-compose.dev.yml up -d db

build:  ## Build all Docker images
	docker compose build

up:  ## Start full Docker Compose stack
	docker compose up -d

down:  ## Stop Docker Compose stack
	docker compose down

test:  ## Run all tests
	cd backend && uv run pytest
	cd frontend && npx vitest run

test-backend:  ## Run backend tests only
	cd backend && uv run pytest -v

test-frontend:  ## Run frontend tests only
	cd frontend && npx vitest run

lint:  ## Lint all code
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint

lint-fix:  ## Auto-fix lint issues
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && npm run lint -- --fix

setup:  ## Initial project setup
	cd backend && uv sync
	cd frontend && npm install

clean:  ## Clean build artifacts
	cd backend && rm -rf .venv __pycache__ .pytest_cache .ruff_cache
	cd frontend && rm -rf node_modules dist
