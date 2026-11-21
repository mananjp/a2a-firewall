"""TAXII 2.1 and STIX threat intelligence API routes.

Provides:
1. TAXII 2.1 standard endpoints (discovery, API root, collections, objects)
2. Threat feed management (add/list/poll/delete external TAXII feeds)
3. STIX export helpers (convert workspace violations to STIX bundles)
4. Manual indicator ingestion

All TAXII endpoints return ``application/taxii+json;version=2.1``.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.core.stix_converter import (
    a2a_firewall_identity,
    create_bundle,
    ips_signature_to_indicator,
    soc_alert_to_report,
    violations_to_stix_bundle,
)
from a2a_firewall.core.taxii_server import (
    TAXII_CONTENT_TYPE,
    add_objects,
    get_collection,
    get_manifest,
    get_object_by_id,
    list_collections,
    list_objects,
    taxii_api_root,
    taxii_discovery,
)
from a2a_firewall.core.threat_intel_consumer import (
    ThreatFeedConfig,
    apply_stix_indicators_to_ips,
    poll_and_apply_feed,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import (
    SOCAlert,
    ThreatFeed,
    Violation,
    Workspace,
)
from a2a_firewall.detection.ips_signatures import get_engine

logger = logging.getLogger(__name__)

router = APIRouter()


def _taxii_response(data: Any, status_code: int = 200) -> JSONResponse:
    """Return a TAXII-compliant JSON response."""
    return JSONResponse(
        content=data,
        status_code=status_code,
        media_type=TAXII_CONTENT_TYPE,
    )


# ═══════════════════════════════════════════════════════════════════════════
# TAXII 2.1 Standard Endpoints
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/discovery")
async def discovery(request: Request) -> JSONResponse:
    """TAXII 2.1 Discovery — advertise the server and its API roots."""
    base = str(request.base_url).rstrip("/")
    return _taxii_response(taxii_discovery(base))


@router.get("/api-root")
async def api_root() -> JSONResponse:
    """TAXII 2.1 API Root information."""
    return _taxii_response(taxii_api_root())


@router.get("/collections")
async def collections(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """TAXII 2.1 Collections — list available collections for this workspace."""
    colls = await list_collections(ws.id, db)
    return _taxii_response({"collections": colls})


@router.get("/collections/{collection_id}")
async def collection_detail(
    collection_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """TAXII 2.1 Collection — get details of a specific collection."""
    coll = await get_collection(ws.id, collection_id, db)
    if not coll:
        raise HTTPException(404, "Collection not found")
    return _taxii_response(coll)


@router.get("/collections/{collection_id}/objects")
async def collection_objects(
    collection_id: str,
    added_after: str | None = Query(None, description="ISO-8601 timestamp filter"),
    type: str | None = Query(None, alias="match[type]", description="Filter by STIX type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """TAXII 2.1 Objects — list STIX objects in a collection."""
    result = await list_objects(
        ws.id,
        collection_id,
        db,
        added_after=added_after,
        stix_type=type,
        limit=limit,
        offset=offset,
    )
    return _taxii_response(result)


class STIXObjectsPayload(BaseModel):
    objects: list[dict[str, Any]]


@router.post("/collections/{collection_id}/objects")
async def add_collection_objects(
    collection_id: str,
    body: STIXObjectsPayload,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """TAXII 2.1 Add Objects — add STIX objects to a collection."""
    result = await add_objects(
        ws.id, collection_id, body.objects, db, source="taxii-api"
    )

    # Also apply indicators to the IPS engine for immediate effect
    indicators = [o for o in body.objects if o.get("type") == "indicator"]
    if indicators:
        sigs = apply_stix_indicators_to_ips(indicators, source="taxii-api-ingest")
        result["ips_signatures_created"] = len(sigs)

    status_code = 202 if result["status"] != "error" else 422
    return _taxii_response(result, status_code)


@router.get("/collections/{collection_id}/objects/{object_id}")
async def get_stix_object(
    collection_id: str,
    object_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """TAXII 2.1 Get Object — retrieve a specific STIX object by ID."""
    obj = await get_object_by_id(ws.id, collection_id, object_id, db)
    if obj is None:
        raise HTTPException(404, "Object not found")
    return _taxii_response({"objects": [obj]})


@router.get("/collections/{collection_id}/manifest")
async def collection_manifest(
    collection_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """TAXII 2.1 Manifest — lightweight listing of objects in a collection."""
    result = await get_manifest(ws.id, collection_id, db, limit=limit, offset=offset)
    return _taxii_response(result)


# ═══════════════════════════════════════════════════════════════════════════
# STIX Export Helpers
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/export/violations")
async def export_violations_as_stix(
    limit: int = Query(50, ge=1, le=500),
    severity: str | None = Query(None),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Export recent violations as a STIX 2.1 Bundle."""
    query = select(Violation).where(Violation.workspace_id == ws.id)
    if severity:
        query = query.where(Violation.severity == severity)
    query = query.order_by(desc(Violation.created_at)).limit(limit)

    result = await db.execute(query)
    violations = result.scalars().all()

    stix_violations = [
        {
            "violation_type": str(v.violation_type),
            "severity": str(v.severity),
            "layer": str(v.layer),
            "details": v.details or {},
            "task_id": str(v.task_id),
        }
        for v in violations
    ]

    bundle = violations_to_stix_bundle(
        stix_violations,
        {"task_id": "export", "task_type": "batch-export"},
        "export",
        0.0,
        str(ws.id),
        str(ws.name),
    )
    return _taxii_response(bundle)


@router.get("/export/ips-signatures")
async def export_ips_signatures_as_stix(
    ws: Workspace = Depends(get_current_workspace),
) -> JSONResponse:
    """Export the full IPS signature database as STIX 2.1 Indicators."""
    engine = get_engine()
    sigs = engine.get_stats()

    stix_objects = [a2a_firewall_identity()]
    for sig in sigs:
        stix_objects.append(ips_signature_to_indicator(sig))

    bundle = create_bundle(stix_objects)
    return _taxii_response(bundle)


@router.get("/export/soc-alerts")
async def export_soc_alerts_as_stix(
    limit: int = Query(50, ge=1, le=500),
    severity: str | None = Query(None),
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    """Export recent SOC alerts as STIX 2.1 Reports."""
    query = select(SOCAlert).where(SOCAlert.workspace_id == ws.id)
    if severity:
        query = query.where(SOCAlert.severity == severity)
    query = query.order_by(desc(SOCAlert.created_at)).limit(limit)

    result = await db.execute(query)
    alerts = result.scalars().all()

    stix_objects = [a2a_firewall_identity()]
    for alert in alerts:
        report = soc_alert_to_report(
            {
                "id": str(alert.id),
                "title": str(alert.title),
                "description": str(alert.description) if alert.description else "",
                "severity": str(alert.severity),
                "status": str(alert.status),
                "mitre_technique": alert.mitre_technique,
                "created_at": str(alert.created_at),
            }
        )
        stix_objects.append(report)

    bundle = create_bundle(stix_objects)
    return _taxii_response(bundle)


# ═══════════════════════════════════════════════════════════════════════════
# External Feed Management
# ═══════════════════════════════════════════════════════════════════════════


class FeedCreate(BaseModel):
    name: str
    taxii_url: str
    api_root: str
    collection_id: str
    auth_type: str = "none"
    auth_credentials: str = ""
    poll_interval_minutes: int = 60
    enabled: bool = True


@router.post("/feeds")
async def create_feed(
    body: FeedCreate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Register an external TAXII feed for threat intelligence consumption."""
    feed = ThreatFeed(
        workspace_id=ws.id,
        name=body.name,
        taxii_url=body.taxii_url,
        api_root=body.api_root,
        collection_id=body.collection_id,
        auth_type=body.auth_type,
        auth_credentials=body.auth_credentials,
        poll_interval_minutes=body.poll_interval_minutes,
        enabled=body.enabled,
    )
    db.add(feed)
    await db.commit()
    await db.refresh(feed)

    return {
        "id": str(feed.id),
        "name": feed.name,
        "taxii_url": feed.taxii_url,
        "api_root": feed.api_root,
        "collection_id": feed.collection_id,
        "auth_type": feed.auth_type,
        "poll_interval_minutes": feed.poll_interval_minutes,
        "enabled": feed.enabled,
        "created_at": str(feed.created_at),
    }


@router.get("/feeds")
async def list_feeds(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all configured external TAXII feeds."""
    result = await db.execute(
        select(ThreatFeed).where(ThreatFeed.workspace_id == ws.id)
    )
    feeds = result.scalars().all()
    return [
        {
            "id": str(f.id),
            "name": f.name,
            "taxii_url": f.taxii_url,
            "api_root": f.api_root,
            "collection_id": f.collection_id,
            "auth_type": f.auth_type,
            "poll_interval_minutes": f.poll_interval_minutes,
            "enabled": f.enabled,
            "last_polled_at": str(f.last_polled_at) if f.last_polled_at else None,
            "last_poll_status": f.last_poll_status,
            "objects_received": f.objects_received or 0,
            "created_at": str(f.created_at),
        }
        for f in feeds
    ]


@router.post("/feeds/{feed_id}/poll")
async def poll_feed(
    feed_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Manually trigger a poll of an external TAXII feed."""
    result = await db.execute(
        select(ThreatFeed).where(
            ThreatFeed.id == uuid.UUID(feed_id),
            ThreatFeed.workspace_id == ws.id,
        )
    )
    feed_row = result.scalar_one_or_none()
    if not feed_row:
        raise HTTPException(404, "Feed not found")

    config = ThreatFeedConfig(
        id=str(feed_row.id),
        name=feed_row.name,
        taxii_url=feed_row.taxii_url,
        api_root=feed_row.api_root,
        collection_id=feed_row.collection_id,
        auth_type=feed_row.auth_type,
        auth_credentials=feed_row.auth_credentials or "",
        poll_interval_minutes=feed_row.poll_interval_minutes or 60,
        added_after=str(feed_row.last_polled_at) if feed_row.last_polled_at else "",
    )

    poll_result = await poll_and_apply_feed(config)

    # Update feed status
    feed_row.last_polled_at = datetime.now(UTC)
    feed_row.last_poll_status = "success" if poll_result["objects_received"] > 0 else "empty"
    feed_row.objects_received = (feed_row.objects_received or 0) + poll_result["objects_received"]
    await db.commit()

    return poll_result


@router.delete("/feeds/{feed_id}")
async def delete_feed(
    feed_id: str,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Remove an external TAXII feed configuration."""
    result = await db.execute(
        select(ThreatFeed).where(
            ThreatFeed.id == uuid.UUID(feed_id),
            ThreatFeed.workspace_id == ws.id,
        )
    )
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(404, "Feed not found")

    await db.delete(feed)
    await db.commit()
    return {"status": "deleted", "id": feed_id}


class FeedUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    poll_interval_minutes: int | None = None
    auth_type: str | None = None
    auth_credentials: str | None = None


@router.patch("/feeds/{feed_id}")
async def update_feed(
    feed_id: str,
    body: FeedUpdate,
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update an external TAXII feed configuration."""
    result = await db.execute(
        select(ThreatFeed).where(
            ThreatFeed.id == uuid.UUID(feed_id),
            ThreatFeed.workspace_id == ws.id,
        )
    )
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(404, "Feed not found")

    if body.name is not None:
        feed.name = body.name
    if body.enabled is not None:
        feed.enabled = body.enabled
    if body.poll_interval_minutes is not None:
        feed.poll_interval_minutes = body.poll_interval_minutes
    if body.auth_type is not None:
        feed.auth_type = body.auth_type
    if body.auth_credentials is not None:
        feed.auth_credentials = body.auth_credentials

    await db.commit()
    await db.refresh(feed)

    return {
        "id": str(feed.id),
        "name": feed.name,
        "enabled": feed.enabled,
        "poll_interval_minutes": feed.poll_interval_minutes,
        "auth_type": feed.auth_type,
        "updated_at": str(feed.updated_at),
    }


# ═══════════════════════════════════════════════════════════════════════════
# Status & Statistics
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/status")
async def taxii_status(
    ws: Workspace = Depends(get_current_workspace),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """STIX/TAXII integration status and statistics."""
    from a2a_firewall.db.models import STIXObject

    # Collection counts
    colls = await list_collections(ws.id, db)

    # Total STIX objects
    from sqlalchemy import func

    obj_count_result = await db.execute(
        select(func.count(STIXObject.id)).where(STIXObject.workspace_id == ws.id)
    )
    total_objects = obj_count_result.scalar() or 0

    # Feed counts
    feed_result = await db.execute(
        select(ThreatFeed).where(ThreatFeed.workspace_id == ws.id)
    )
    feeds = feed_result.scalars().all()

    # IPS signature stats
    engine = get_engine()
    total_sigs = len(engine.signatures)
    external_sigs = sum(1 for s in engine.signatures if s.id.startswith("EXT-"))

    return {
        "taxii_version": "2.1",
        "stix_version": "2.1",
        "collections": len(colls),
        "total_stix_objects": total_objects,
        "feeds": {
            "total": len(feeds),
            "enabled": sum(1 for f in feeds if f.enabled),
            "last_poll_status": {
                f.name: f.last_poll_status for f in feeds if f.last_poll_status
            },
        },
        "ips_integration": {
            "total_signatures": total_sigs,
            "external_signatures": external_sigs,
            "builtin_signatures": total_sigs - external_sigs,
        },
    }

