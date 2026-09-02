"""Memory / RAG firewall routes — inspect, store, retrieve, and inspect a query."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.api.deps import get_current_agent
from a2a_firewall.core.memory_firewall import (
    MemoryIndex,
    evaluate_store_policy,
)
from a2a_firewall.db.database import get_db
from a2a_firewall.db.models import (
    Agent,
    MemoryEntry,
    MemoryInspectionLog,
    MemoryRetrievalLog,
)
from a2a_firewall.detection.memory_scanner import MemoryScanner, hash_memory

router = APIRouter()


class InspectMemoryRequest(BaseModel):
    """A candidate memory chunk to inspect before it is stored."""

    chunk: str
    redact_pii: bool = True


class StoreMemoryRequest(BaseModel):
    """Persist an inspected memory chunk (after it passed inspection)."""

    chunk: str
    metadata: dict[str, Any] = {}
    persist_only_if_clean: bool = True
    redact_pii: bool = True


class InspectQueryRequest(BaseModel):
    """A retrieval query to screen for injection before memory is released."""

    query: str


class SearchMemoryRequest(BaseModel):
    """Screen and retrieve memory matching a query."""

    query: str
    top_k: int = 5


@router.post("/inspect")
async def inspect_memory(
    body: InspectMemoryRequest,
    agent: Agent = Depends(get_current_agent),
) -> dict[str, Any]:
    """Inspect a candidate memory write before it is stored.

    Classifies the chunk as ``allow`` / ``redact`` / ``block``. Blocked chunks
    (persistent injection, secret probes, sensitive PII) must never be stored;
    redacted chunks may be stored in redacted form.
    """
    result = MemoryScanner().inspect(body.chunk, redact_pii=body.redact_pii)
    decision = evaluate_store_policy(result, allow_pii_redaction=body.redact_pii)
    return {
        "agent_id": str(agent.id),
        "inspection": result.to_dict(),
        "store_policy": {
            "persist": decision.persist,
            "reason": decision.reason,
            "content_hash": decision.content_hash,
        },
    }


@router.post("/inspect-query")
async def inspect_query(
    body: InspectQueryRequest,
    agent: Agent = Depends(get_current_agent),
) -> dict[str, Any]:
    """Screen a retrieval query for injection before it is released to memory."""
    result = MemoryScanner().inspect(body.query, redact_pii=False)
    return {
        "agent_id": str(agent.id),
        "blocked": result.blocked,
        "action": result.action,
        "findings": [
            {"type": f.finding_type, "severity": f.severity, "description": f.description}
            for f in result.findings
        ],
    }


@router.post("/store")
async def store_memory(
    body: StoreMemoryRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Inspect, then (if allowed) persist a memory chunk with dedup by hash."""
    scanner = MemoryScanner()
    inspection = scanner.inspect(body.chunk, redact_pii=body.redact_pii)
    decision = evaluate_store_policy(inspection, allow_pii_redaction=body.redact_pii)

    # Audit the inspection regardless of outcome.
    db.add(
        MemoryInspectionLog(
            workspace_id=agent.workspace_id,
            agent_id=agent.id,
            content_hash=decision.content_hash or inspection.content_hash,
            action=decision.reason,
            blocked=decision.persist is not True and body.persist_only_if_clean,
            findings=inspection.to_dict().get("findings", []),
        )
    )

    if not decision.persist:
        if body.persist_only_if_clean:
            await db.commit()
            return {
                "persisted": False,
                "reason": decision.reason,
                "inspection": inspection.to_dict(),
            }
        # persist_only_if_clean=False → store even if redact class; block still refused.
        if decision.reason == "block":
            await db.commit()
            return {
                "persisted": False,
                "reason": "block",
                "inspection": inspection.to_dict(),
            }
        decision_content = decision.content or body.chunk
        decision_hash = hash_memory(decision_content)
    else:
        decision_content = decision.content or ""
        decision_hash = decision.content_hash or hash_memory(decision.content or "")

    # Dedup by content hash within the workspace.
    existing = await db.execute(
        select(MemoryEntry).where(
            MemoryEntry.workspace_id == agent.workspace_id,
            MemoryEntry.content_hash == decision_hash,
        )
    )
    if existing.scalar_one_or_none() is None:
        db.add(
            MemoryEntry(
                workspace_id=agent.workspace_id,
                source_agent_id=agent.id,
                content=decision_content or "",
                content_hash=decision_hash,
                metadata_=body.metadata,
            )
        )
        await db.commit()
        return {
            "persisted": True,
            "deduped": False,
            "content_hash": decision_hash,
            "action": decision.reason,
            "inspection": inspection.to_dict(),
        }

    await db.commit()
    return {
        "persisted": True,
        "deduped": True,
        "content_hash": decision_hash,
        "action": decision.reason,
        "inspection": inspection.to_dict(),
    }


@router.post("/search")
async def search_memory(
    body: SearchMemoryRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Screen the query, then retrieve stored memory chunks ranked by relevance.

    Only already-approved (post-inspection, post-redaction) content is returned —
    never raw pre-inspection chunks — so a previously-poisoned write cannot reach
    the agent. Retrieval is lexical (free tier); embeddings are a later seam.
    """
    query_inspection = MemoryScanner().inspect(body.query, redact_pii=False)
    if query_inspection.blocked:
        await _log_retrieval(db, agent, body.query, [], blocked=True)
        return {
            "blocked": True,
            "results": [],
            "query_action": "block",
            "findings": [
                {"type": f.finding_type, "severity": f.severity, "description": f.description}
                for f in query_inspection.findings
            ],
        }

    top_k = max(1, min(int(body.top_k), 20))
    result = await db.execute(
        select(MemoryEntry).where(MemoryEntry.workspace_id == agent.workspace_id)
    )
    rows = result.scalars().all()

    index = MemoryIndex()
    for row in rows:
        index.index(str(row.id), row.content, row.content_hash)
    hits = index.search(body.query, top_k=top_k)

    # Resolve hit ids back to full stored (post-inspection) content.
    by_id = {str(row.id): row for row in rows}
    queried_ids: list[str] = []
    results: list[dict[str, Any]] = []
    for hit in hits:
        entry = by_id.get(hit.entry_id)
        if entry is None:
            continue
        queried_ids.append(hit.entry_id)
        results.append(
            {
                "entry_id": hit.entry_id,
                "content": entry.content,
                "content_hash": entry.content_hash,
                "score": hit.score,
                "metadata": entry.metadata_,
            }
        )

    await _log_retrieval(db, agent, body.query, queried_ids, blocked=False)
    return {
        "blocked": False,
        "query_action": "allow",
        "result_count": len(results),
        "results": results,
    }


async def _log_retrieval(
    db: AsyncSession,
    agent: Agent,
    query: str,
    matched_ids: list[str],
    *,
    blocked: bool,
) -> None:
    db.add(
        MemoryRetrievalLog(
            workspace_id=agent.workspace_id,
            agent_id=agent.id,
            query_hash=hash_memory(query),
            query_preview=(query[:120] if query else None),
            matched_entry_ids=matched_ids if not blocked else [],
            result_count=0 if blocked else len(matched_ids),
        )
    )
    await db.commit()
