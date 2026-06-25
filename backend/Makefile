.PHONY: help install lint format typecheck test test-unit test-int test-e2e migrate build audit pipeline clean run dev docker-up docker-down

PYTHON ?= python
VENV ?= .venv
PY := $(VENV)/Scripts/python.exe
PIP := $(VENV)/Scripts/pip.exe
RUFF := $(VENV)/Scripts/ruff.exe
MYPY := $(VENV)/Scripts/mypy.exe
PIP_AUDIT := $(VENV)/Scripts/pip-audit.exe
PYTEST := $(VENV)/Scripts/pytest.exe

help:
	@echo "A2A Firewall Backend — pipeline targets"
	@echo ""
	@echo "  make install      Install runtime + dev dependencies into .venv"
	@echo "  make lint         Ruff lint"
	@echo "  make format       Ruff format (write)"
	@echo "  make format-check Ruff format (check only)"
	@echo "  make typecheck    mypy --strict"
	@echo "  make test         All tests"
	@echo "  make test-unit    Unit tests only"
	@echo "  make test-int     Integration tests (requires TEST_DATABASE_URL)"
	@echo "  make test-e2e     E2E tests (requires running services)"
	@echo "  make migrate      Apply Alembic migrations to DATABASE_URL"
	@echo "  make build        Docker image build"
	@echo "  make audit        pip-audit dependency vulnerability scan"
	@echo "  make pipeline     Run steps 1-6 (lint, format, typecheck, test, build, audit)"
	@echo "  make dev          Start backend with hot-reload"
	@echo "  make docker-up    Start docker-compose stack"
	@echo "  make docker-down  Stop docker-compose stack"
	@echo "  make clean        Remove .venv and build artifacts"

install:
	$(PY) -m pip install --upgrade pip
	$(PIP) install -r requirements.txt -r requirements-dev.txt
	$(PIP) install -e .

lint:
	$(RUFF) check src tests

format:
	$(RUFF) format src tests

format-check:
	$(RUFF) format --check src tests

typecheck:
	$(MYPY) src

test: test-unit

test-unit:
	$(PYTEST) tests/unit -v --cov=src/a2a_firewall --cov-report=term-missing

test-int:
	$(PYTEST) tests/integration -v

test-e2e:
	$(PYTEST) tests/e2e -v

migrate:
	$(PY) -m alembic upgrade head

build:
	docker build -t a2a-firewall-backend:test -f ../docker/Dockerfile .

audit:
	$(PIP_AUDIT) -r requirements.txt -r requirements-dev.txt

pipeline: lint format-check typecheck test-unit build audit
	@echo ""
	@echo "=== PIPELINE PASSED ==="

dev:
	$(PY) -m uvicorn a2a_firewall.main:app --host 0.0.0.0 --port 8000 --reload

docker-up:
	cd .. && docker-compose up --build -d

docker-down:
	cd .. && docker-compose down

clean:
	rm -rf $(VENV) .pytest_cache .mypy_cache .ruff_cache src/*.egg-info *.egg-info build dist
	find . -type d -name __pycache__ -exec rm -rf {} +