# Database Backup & Recovery Runbook

## Overview

A2A Firewall uses **Neon Postgres** (serverless) as its primary database. This
document covers backup strategy, PITR capabilities, and disaster recovery
procedures.

## Current Setup

| Item | Value |
|---|---|
| Provider | Neon (serverless Postgres) |
| Engine | PostgreSQL 16 |
| Region | `us-east-1` (via `ep-still-mountain-at8rg2xd-pooler`) |
| Migrations | Alembic (currently at revision `010`) |
| Schema tables | 15+ (workspaces, agents, tasks, violations, trace_events, delegation_chains, etc.) |

## Neon PITR Capabilities

Neon provides **Point-in-Time Recovery** on paid plans:

- **Free tier**: 7-day history with branching
- **Pro tier**: 30-day PITR with 1-second granularity
- **Scale tier**: Configurable retention up to 30 days

### How to restore from a point in time:

1. Go to **Neon Console → Project → Branches**
2. Click **Create Branch** → select **From a point in time**
3. Choose the timestamp to restore to
4. The branch creates a full copy of the database at that timestamp
5. Update `DATABASE_URL` in Render to point to the new branch endpoint
6. Verify with `python scripts/check_db_backup.py`

## Backup Verification

Run the verification script regularly:

```bash
cd backend
python scripts/check_db_backup.py
```

This reports:
- Connection details and Postgres version
- Current Alembic migration version
- Row counts for all critical tables
- Database size
- Backup checklist items

## Manual Backup (pg_dump)

For an additional safety net, take periodic logical backups:

```bash
# Export full schema + data
pg_dump "$DATABASE_URL" --no-owner --no-privileges -F custom -f backup_$(date +%Y%m%d).dump

# Restore to a new database
pg_restore -d "$NEW_DATABASE_URL" --no-owner --no-privileges backup_20240101.dump
```

## Disaster Recovery Procedure

### Scenario 1: Accidental data deletion

1. Identify the timestamp **before** the deletion occurred
2. Create a Neon branch from that point in time
3. Export the affected tables from the branch
4. Import into the production database

### Scenario 2: Database corruption / total loss

1. Create a new Neon branch from the latest good PITR point
2. Verify data integrity with `check_db_backup.py`
3. Update `DATABASE_URL` in Render dashboard
4. Trigger a new deployment to reconnect the backend

### Scenario 3: Migration failure

1. Run `alembic downgrade -1` to revert the last migration
2. Fix the migration script
3. Run `alembic upgrade head` again
4. If downgrade fails, restore from PITR branch

## Monitoring Checklist

- [ ] Set up Neon email alerts for compute usage spikes
- [ ] Monitor connection pool utilization in Neon dashboard
- [ ] Set up uptime monitoring for the `/health` endpoint
- [ ] Review database size monthly (Neon free tier: 0.5 GiB storage)
- [ ] Test PITR recovery quarterly (create a test branch, verify data)

## Pre-Design-Partner Checklist

Before onboarding any design partner or external user:

- [ ] Verify PITR is enabled and retention period is adequate
- [ ] Take a manual pg_dump backup
- [ ] Confirm SSL is enforced (`sslmode=require`)
- [ ] Verify `DATABASE_URL` in Render uses the pooler endpoint
- [ ] Run `check_db_backup.py` and resolve any issues
- [ ] Document the workspace/data isolation strategy for multi-tenant use
