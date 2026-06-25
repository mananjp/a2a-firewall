.PHONY: help install lint format typecheck test test-unit build dev clean

NPM ?= npm

help:
	@echo "A2A Firewall Frontend — pipeline targets"
	@echo ""
	@echo "  make install     npm ci (clean install from lockfile)"
	@echo "  make lint        eslint"
	@echo "  make format      prettier --write"
	@echo "  make typecheck   tsc --noEmit"
	@echo "  make test        vitest --run (CI mode)"
	@echo "  make build       vite build"
	@echo "  make dev         vite dev server"
	@echo "  make clean       remove node_modules, dist, coverage"

install:
	$(NPM) ci

lint:
	$(NPM) run lint

format:
	$(NPM) run format

typecheck:
	$(NPM) run typecheck

test test-unit:
	$(NPM) run test -- --run

build:
	$(NPM) run build

dev:
	$(NPM) run dev

clean:
	rm -rf node_modules dist coverage .vite
	find . -type d -name node_modules -prune -o -type d -name dist -prune -o -type f -name '*.tsbuildinfo' -delete