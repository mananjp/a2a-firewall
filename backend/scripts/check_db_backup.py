"""Database backup verification script.

Connects to the configured database, reports table counts, current migration
version, and prints a checklist of PITR/backup items to verify in the
Neon/Postgres dashboard.

Usage:
    cd backend
    python scripts/check_db_backup.py
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure the backend package is importable
sys.path.insert(0, "src")

from a2a_firewall.db.database import AsyncSessionLocal  # noqa: E402


CRITICAL_TABLES = [
    "workspaces",
    "agents",
    "tasks",
    "violations",
    "trace_events",
    "delegation_chains",
    "agent_identities",
    "telemetry",
    "review_items",
    "agent_permissions",
    "resource_permissions",
    "workspace_spend_limits",
    "agent_spend_limits",
    "spend_ledger",
    "rate_limit_counters",
]


async def main() -> None:
    print("=" * 60)
    print("  A2A Firewall — Database Backup Verification")
    print("=" * 60)
    print()

    async with AsyncSessionLocal() as db:
        # 1. Connection info
        result = await db.execute(text("SELECT current_database(), current_user, version()"))
        row = result.fetchone()
        if row:
            print(f"  Database: {row[0]}")
            print(f"  User:     {row[1]}")
            print(f"  Version:  {row[2][:60]}...")
        print()

        # 2. Current Alembic migration version
        try:
            result = await db.execute(text("SELECT version_num FROM alembic_version"))
            version = result.scalar_one_or_none()
            print(f"  Alembic version: {version or 'NOT FOUND (migrations not applied?)'}")
        except Exception:
            print("  Alembic version: ERROR (alembic_version table missing?)")
        print()

        # 3. Table row counts
        print("  Table Row Counts:")
        print("  " + "-" * 40)
        for table in CRITICAL_TABLES:
            try:
                result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))  # noqa: S608
                count = result.scalar_one()
                print(f"    {table:<35} {count:>8}")
            except Exception:
                print(f"    {table:<35} {'MISSING':>8}")
        print()

        # 4. Database size
        try:
            result = await db.execute(
                text("SELECT pg_size_pretty(pg_database_size(current_database()))")
            )
            size = result.scalar_one()
            print(f"  Database size: {size}")
        except Exception:
            print("  Database size: Could not determine")
        print()

    # 5. Backup checklist
    print("  BACKUP VERIFICATION CHECKLIST")
    print("  " + "=" * 40)
    checklist = [
        "[ ] Neon project has branching enabled",
        "[ ] Point-in-Time Recovery (PITR) is available on current plan",
        "[ ] Compute auto-suspend timeout is configured (not too aggressive)",
        "[ ] Connection pooling is enabled for production workloads",
        "[ ] Database credentials are stored in Render env vars (not .env)",
        "[ ] Alembic migration version matches expected (010)",
        "[ ] All critical tables exist and have expected row counts",
        "[ ] SSL is enforced for all connections (sslmode=require)",
        "[ ] IP allowlist is configured in Neon dashboard (if applicable)",
        "[ ] Regular backup exports are scheduled (pg_dump or Neon snapshots)",
    ]
    for item in checklist:
        print(f"    {item}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
