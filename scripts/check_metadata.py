#!/usr/bin/env python3
# Copyright (c) 2026 Manan Jayeshkumar Panchal.
# Licensed under the Apache License, Version 2.0.
"""Fail CI when version/license metadata drifts or README contains machine-local links."""
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# ── artifact paths and expected licenses ─────────────────────────────────
BACKEND_PYPROJECT = ROOT / "backend" / "pyproject.toml"
SDK_PYPROJECT = ROOT / "sdk" / "pyproject.toml"
SDK_TS_PACKAGE = ROOT / "sdk-ts" / "package.json"
N8N_PACKAGE = ROOT / "integrations" / "n8n" / "package.json"

LICENSE_EXPECTATIONS: dict[Path, str] = {
    BACKEND_PYPROJECT: "Apache-2.0",
    SDK_PYPROJECT: "MIT",
    SDK_TS_PACKAGE: "MIT",
    N8N_PACKAGE: "MIT",
}

README = ROOT / "README.md"

errors: list[str] = []


def py_license(path: Path) -> str | None:
    """Extract the license string from a pyproject.toml [project] table."""
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    project = data.get("project", {})
    lic = project.get("license")
    if isinstance(lic, dict):
        lic = lic.get("text") or lic.get("file")
    return lic


def js_license(path: Path) -> str | None:
    """Extract the license string from a package.json."""
    return json.loads(path.read_text(encoding="utf-8")).get("license")


# ── license field checks ─────────────────────────────────────────────────
for path, expected in LICENSE_EXPECTATIONS.items():
    if not path.exists():
        continue
    actual = py_license(path) if path.suffix == ".toml" else js_license(path)
    if actual != expected:
        errors.append(
            f"{path.relative_to(ROOT)}: license is {actual!r}, expected {expected!r}"
        )

# ── README version badge must match backend version ──────────────────────
if BACKEND_PYPROJECT.exists() and README.exists():
    backend_version = tomllib.loads(
        BACKEND_PYPROJECT.read_text(encoding="utf-8")
    )["project"]["version"]

    readme_text = README.read_text(encoding="utf-8")
    badge = re.search(r"Version-([0-9]+\.[0-9]+\.[0-9]+)", readme_text)
    if not badge or badge.group(1) != backend_version:
        errors.append(
            f"README version badge ({badge.group(1) if badge else 'missing'}) "
            f"!= backend version ({backend_version})"
        )

# ── no machine-local file:/// links anywhere in docs ─────────────────────
SKIP_DIRS = {"node_modules", ".venv", ".git", "__pycache__", "dist", ".mypy_cache"}

for md in ROOT.rglob("*.md"):
    if any(part in SKIP_DIRS for part in md.parts):
        continue
    try:
        content = md.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    if "file:///" in content:
        errors.append(f"{md.relative_to(ROOT)}: contains file:/// link")

# ── NOTICE file must exist ───────────────────────────────────────────────
if not (ROOT / "NOTICE").exists():
    errors.append("NOTICE file missing at repo root")

# ── results ──────────────────────────────────────────────────────────────
if errors:
    print("Metadata check FAILED:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("Metadata OK")
