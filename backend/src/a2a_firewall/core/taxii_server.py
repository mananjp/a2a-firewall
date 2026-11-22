"""TAXII 2.1 server implementation for A2A Firewall.

Implements the OASIS TAXII 2.1 specification endpoints:
  - Discovery      (GET /taxii2/)
  - API Root       (GET /taxii2/a2a/)
  - Collections    (GET /taxii2/a2a/collections/)
  - Collection     (GET /taxii2/a2a/collections/{id}/)
  - Objects        (GET /taxii2/a2a/collections/{id}/objects/)
  - Add Objects    (POST /taxii2/a2a/collections/{id}/objects/)
  - Manifest       (GET /taxii2/a2a/collections/{id}/manifest/)
  - Object by ID   (GET /taxii2/a2a/collections/{id}/objects/{object_id}/)

Each workspace gets its own set of collections:
  - ``violations``    — STIX bundles from firewall violations
  - ``soc-alerts``    — STIX reports from SOC alerts
  - ``ips-signatures``— STIX indicators from IPS signature DB
  - ``threat-intel``  — Externally-consumed indicators applied to detection

Content-Type: ``application/taxii+json;version=2.1``
"""

from __future__ import annotations

import contextlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.db.models import STIXObject, ThreatIntelCollection

logger = logging.getLogger(__name__)

TAXII_CONTENT_TYPE = "application/taxii+json;version=2.1"


# ---------------------------------------------------------------------------
# Default collections per workspace
# ---------------------------------------------------------------------------

DEFAULT_COLLECTIONS: list[dict[str, Any]] = [
    {
        "id": "violations",
        "title": "Firewall Violations",
        "description": "STIX bundles generated from A2A Firewall violation events",
        "can_read": True,
        "can_write": False,
        "media_types": [TAXII_CONTENT_TYPE],
    },
    {
        "id": "soc-alerts",
        "title": "SOC Alerts",
        "description": "STIX reports wrapping SOC alert triage objects",
        "can_read": True,
        "can_write": False,
        "media_types": [TAXII_CONTENT_TYPE],
    },
    {
        "id": "ips-signatures",
        "title": "IPS Signatures",
        "description": "STIX indicators derived from the built-in IPS signature database",
        "can_read": True,
        "can_write": False,
        "media_types": [TAXII_CONTENT_TYPE],
    },
    {
        "id": "threat-intel",
        "title": "External Threat Intelligence",
        "description": "Indicators consumed from external TAXII feeds, applied to detection",
        "can_read": True,
        "can_write": True,
        "media_types": [TAXII_CONTENT_TYPE],
    },
]


# ---------------------------------------------------------------------------
# TAXII Discovery & API Root
# ---------------------------------------------------------------------------


def taxii_discovery(base_url: str) -> dict[str, Any]:
    """TAXII 2.1 Discovery response."""
    return {
        "title": "A2A Firewall TAXII Server",
        "description": (
            "TAXII 2.1 endpoint for sharing AI agent threat intelligence. "
            "Provides STIX 2.1 objects from firewall violations, SOC alerts, "
            "IPS signatures, and external threat feeds."
        ),
        "contact": "security@a2afirewall.dev",
        "default": f"{base_url}/taxii2/a2a/",
        "api_roots": [f"{base_url}/taxii2/a2a/"],
    }


def taxii_api_root() -> dict[str, Any]:
    """TAXII 2.1 API Root response."""
    return {
        "title": "A2A Firewall Threat Intelligence",
        "description": (
            "AI agent-to-agent communication threat data — violations, "
            "injection attempts, data exfiltration, CVE associations, and "
            "externally-sourced threat indicators."
        ),
        "versions": ["application/taxii+json;version=2.1"],
        "max_content_length": 10485760,  # 10 MB
    }


# ---------------------------------------------------------------------------
# Collections
# ---------------------------------------------------------------------------


async def ensure_default_collections(
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> list[ThreatIntelCollection]:
    """Ensure default TAXII collections exist for a workspace, creating them if needed."""
    result = await db.execute(
        select(ThreatIntelCollection).where(ThreatIntelCollection.workspace_id == workspace_id)
    )
    existing = {str(c.collection_alias): c for c in result.scalars().all()}

    missing_defs = [defn for defn in DEFAULT_COLLECTIONS if defn["id"] not in existing]
    if not missing_defs:
        return [existing[defn["id"]] for defn in DEFAULT_COLLECTIONS if defn["id"] in existing]

    # Detect database dialect for safe ON CONFLICT handling
    dialect_name = ""
    try:
        bind = getattr(db, "bind", None) or getattr(db.sync_session, "bind", None)
        if bind and hasattr(bind, "dialect"):
            dialect_name = getattr(bind.dialect, "name", "")
    except Exception:
        pass

    now = datetime.now(UTC)
    values = [
        {
            "id": uuid.uuid4(),
            "workspace_id": workspace_id,
            "collection_alias": defn["id"],
            "title": defn["title"],
            "description": defn["description"],
            "can_read": defn["can_read"],
            "can_write": defn["can_write"],
            "created_at": now,
        }
        for defn in missing_defs
    ]

    try:
        async with db.begin_nested():
            if dialect_name == "postgresql" or not dialect_name:
                pg_stmt = (
                    pg_insert(ThreatIntelCollection)
                    .values(values)
                    .on_conflict_do_nothing(index_elements=["workspace_id", "collection_alias"])
                )
                await db.execute(pg_stmt)
            elif dialect_name == "sqlite":
                sqlite_stmt = (
                    sqlite_insert(ThreatIntelCollection)
                    .values(values)
                    .on_conflict_do_nothing(index_elements=["workspace_id", "collection_alias"])
                )
                await db.execute(sqlite_stmt)
            else:
                for val in values:
                    coll = ThreatIntelCollection(
                        id=val["id"],
                        workspace_id=val["workspace_id"],
                        collection_alias=val["collection_alias"],
                        title=val["title"],
                        description=val["description"],
                        can_read=val["can_read"],
                        can_write=val["can_write"],
                        created_at=val["created_at"],
                    )
                    db.add(coll)
            await db.flush()
    except IntegrityError:
        # Concurrent request already inserted default collections; savepoint safely rolled back
        pass

    result = await db.execute(
        select(ThreatIntelCollection).where(ThreatIntelCollection.workspace_id == workspace_id)
    )
    return list(result.scalars().all())


async def list_collections(
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """List all TAXII collections for a workspace."""
    collections = await ensure_default_collections(workspace_id, db)
    with contextlib.suppress(Exception):
        await db.commit()
    return [
        {
            "id": str(c.id),
            "title": c.title,
            "description": c.description or "",
            "alias": c.collection_alias,
            "can_read": c.can_read,
            "can_write": c.can_write,
            "media_types": [TAXII_CONTENT_TYPE],
        }
        for c in collections
    ]


async def get_collection(
    workspace_id: uuid.UUID,
    collection_id: str,
    db: AsyncSession,
) -> dict[str, Any] | None:
    """Get a single TAXII collection by ID or alias."""
    # Try UUID first
    try:
        coll_uuid = uuid.UUID(collection_id)
        result = await db.execute(
            select(ThreatIntelCollection).where(
                ThreatIntelCollection.id == coll_uuid,
                ThreatIntelCollection.workspace_id == workspace_id,
            )
        )
    except ValueError:
        # Fall back to alias
        result = await db.execute(
            select(ThreatIntelCollection).where(
                ThreatIntelCollection.collection_alias == collection_id,
                ThreatIntelCollection.workspace_id == workspace_id,
            )
        )

    coll = result.scalar_one_or_none()
    if not coll and collection_id in {defn["id"] for defn in DEFAULT_COLLECTIONS}:
        await ensure_default_collections(workspace_id, db)
        with contextlib.suppress(Exception):
            await db.commit()
        result = await db.execute(
            select(ThreatIntelCollection).where(
                ThreatIntelCollection.collection_alias == collection_id,
                ThreatIntelCollection.workspace_id == workspace_id,
            )
        )
        coll = result.scalar_one_or_none()

    if not coll:
        return None

    return {
        "id": str(coll.id),
        "title": coll.title,
        "description": coll.description or "",
        "alias": coll.collection_alias,
        "can_read": coll.can_read,
        "can_write": coll.can_write,
        "media_types": [TAXII_CONTENT_TYPE],
    }


# ---------------------------------------------------------------------------
# Objects CRUD
# ---------------------------------------------------------------------------


async def _resolve_collection_id(
    workspace_id: uuid.UUID,
    collection_id: str,
    db: AsyncSession,
) -> uuid.UUID | None:
    """Resolve a collection ID or alias to the internal UUID."""
    try:
        coll_uuid = uuid.UUID(collection_id)
        result = await db.execute(
            select(ThreatIntelCollection.id).where(
                ThreatIntelCollection.id == coll_uuid,
                ThreatIntelCollection.workspace_id == workspace_id,
            )
        )
    except ValueError:
        result = await db.execute(
            select(ThreatIntelCollection.id).where(
                ThreatIntelCollection.collection_alias == collection_id,
                ThreatIntelCollection.workspace_id == workspace_id,
            )
        )
    row = result.scalar_one_or_none()
    if row is None and collection_id in {defn["id"] for defn in DEFAULT_COLLECTIONS}:
        await ensure_default_collections(workspace_id, db)
        with contextlib.suppress(Exception):
            await db.commit()
        result = await db.execute(
            select(ThreatIntelCollection.id).where(
                ThreatIntelCollection.collection_alias == collection_id,
                ThreatIntelCollection.workspace_id == workspace_id,
            )
        )
        row = result.scalar_one_or_none()
    return row


async def list_objects(
    workspace_id: uuid.UUID,
    collection_id: str,
    db: AsyncSession,
    *,
    added_after: str | None = None,
    stix_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """List STIX objects in a collection (TAXII GET objects)."""
    coll_id = await _resolve_collection_id(workspace_id, collection_id, db)
    if coll_id is None:
        return {"objects": [], "more": False}

    query = select(STIXObject).where(
        STIXObject.collection_id == coll_id,
        STIXObject.workspace_id == workspace_id,
    )

    if added_after:
        try:
            dt = datetime.fromisoformat(added_after.replace("Z", "+00:00"))
            query = query.where(STIXObject.created_at > dt)
        except ValueError:
            pass

    if stix_type:
        query = query.where(STIXObject.stix_type == stix_type)

    # Total count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.order_by(desc(STIXObject.created_at)).offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.scalars().all()

    objects = [row.stix_data for row in rows]

    return {
        "objects": objects,
        "more": (offset + limit) < total,
    }


async def add_objects(
    workspace_id: uuid.UUID,
    collection_id: str,
    stix_objects: list[dict[str, Any]],
    db: AsyncSession,
    *,
    source: str = "api",
    commit: bool = True,
) -> dict[str, Any]:
    """Add STIX objects to a collection (TAXII POST objects)."""
    coll_id = await _resolve_collection_id(workspace_id, collection_id, db)
    if coll_id is None:
        return {"status": "error", "message": "Collection not found", "total_count": 0}

    successes: list[str] = []
    failures: list[dict[str, Any]] = []

    for obj in stix_objects:
        stix_id = obj.get("id", "")
        stix_type = obj.get("type", "")

        if not stix_id or not stix_type:
            failures.append({"id": stix_id, "message": "Missing id or type"})
            continue

        try:
            row = STIXObject(
                workspace_id=workspace_id,
                collection_id=coll_id,
                stix_id=stix_id,
                stix_type=stix_type,
                stix_data=obj,
                source=source,
                spec_version=obj.get("spec_version", "2.1"),
            )
            db.add(row)
            successes.append(stix_id)
        except Exception as e:
            failures.append({"id": stix_id, "message": str(e)[:200]})

    if commit:
        await db.commit()
    else:
        await db.flush()

    status = "complete" if not failures else ("partial" if successes else "error")
    return {
        "id": str(uuid.uuid4()),
        "status": status,
        "request_timestamp": _now_iso(),
        "total_count": len(stix_objects),
        "success_count": len(successes),
        "successes": [{"id": s, "version": _now_iso()} for s in successes],
        "failure_count": len(failures),
        "failures": failures,
    }


async def get_object_by_id(
    workspace_id: uuid.UUID,
    collection_id: str,
    object_id: str,
    db: AsyncSession,
) -> dict[str, Any] | None:
    """Get a specific STIX object by its STIX ID."""
    coll_id = await _resolve_collection_id(workspace_id, collection_id, db)
    if coll_id is None:
        return None

    result = await db.execute(
        select(STIXObject).where(
            STIXObject.collection_id == coll_id,
            STIXObject.workspace_id == workspace_id,
            STIXObject.stix_id == object_id,
        )
    )
    row = result.scalar_one_or_none()
    return row.stix_data if row else None


async def get_manifest(
    workspace_id: uuid.UUID,
    collection_id: str,
    db: AsyncSession,
    *,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Get the manifest for a collection (lightweight object listing)."""
    coll_id = await _resolve_collection_id(workspace_id, collection_id, db)
    if coll_id is None:
        return {"objects": [], "more": False}

    query = (
        select(
            STIXObject.stix_id, STIXObject.stix_type, STIXObject.created_at, STIXObject.spec_version
        )
        .where(
            STIXObject.collection_id == coll_id,
            STIXObject.workspace_id == workspace_id,
        )
        .order_by(desc(STIXObject.created_at))
    )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    return {
        "objects": [
            {
                "id": row.stix_id,
                "date_added": str(row.created_at) if row.created_at else _now_iso(),
                "version": str(row.created_at) if row.created_at else _now_iso(),
                "media_type": TAXII_CONTENT_TYPE,
            }
            for row in rows
        ],
        "more": (offset + limit) < total,
    }


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")
