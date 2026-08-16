"""Non-amplification scope check for delegation hops.

This is the core primitive that implements the *non-amplification* principle
from the confused-deputy threat model: at every delegation hop, the child
agent's effective capabilities must be a STRICT SUBSET (or equal) of the
delegating agent's parent caveats. A child must never be able to ask for
something the parent did not already possess.

The check is purely functional — no DB, no I/O — so it can be unit-tested
in isolation and reused by other layers (e.g. the SDK, the audit page).

Capability string format mirrors the existing delegation caveat format
(see core/delegation.py):
    "task_type=research"        equality caveat
    "max_risk=0.5"              numeric upper bound (narrowing: child <= parent)
    "max_depth=2"               numeric upper bound
    "resource_type=filesystem"  equality caveat
    "action=read"               equality caveat
"""

from __future__ import annotations

from typing import Any

# Numeric caveat keys that must narrow (child value <= parent value).
_NUMERIC_UPPER_BOUND_KEYS: frozenset[str] = frozenset({"max_risk", "max_depth"})


def parse_requested_scope(request_data: dict[str, Any]) -> set[str]:
    """Extract the set of capability strings a request is asking for.

    Pulls from the structured fields of a request:
    - ``task_type``            -> ``task_type=<value>``
    - ``resource_type`` + ``action`` (both required) -> both caveats
    - ``payload.risk_threshold`` (if numeric) -> ``max_risk=<value>``
    """
    scope: set[str] = set()

    task_type = request_data.get("task_type")
    if isinstance(task_type, str) and task_type:
        scope.add(f"task_type={task_type}")

    resource_type = request_data.get("resource_type")
    action = request_data.get("action")
    # Only emit resource caveats as a pair — a half-formed resource
    # permission (type without action, or vice versa) is meaningless
    # and would be unenforced. Treat as "not requested" in that case.
    if isinstance(resource_type, str) and resource_type and isinstance(action, str) and action:
        scope.add(f"resource_type={resource_type}")
        scope.add(f"action={action}")

    payload = request_data.get("payload")
    if isinstance(payload, dict):
        risk = payload.get("risk_threshold")
        if isinstance(risk, (int, float)):
            # Clamp negative thresholds to 0.0 — negative is nonsensical
            # and would otherwise bypass max_risk narrowing checks.
            clamped = max(0.0, float(risk))
            scope.add(f"max_risk={clamped}")

    return scope


def is_subset(child: set[str], parent_caveats: list[str] | None) -> bool:
    """Return True iff every entry in ``child`` is covered by ``parent_caveats``.

    Covering rules:
    - Equality caveat (``key=value``): parent caveat must have the same key
      with the same value.
    - Numeric upper-bound caveat (``max_risk``, ``max_depth``): parent's value
      must be ``>=`` child's value (parent allows AT LEAST this much).
    - A child caveat that is not present in the parent at all is rejected
      (it is being asked for but never granted).

    Malformed caveats (no ``=``, empty key) are ignored on the parent side
    and treated as unparented on the child side, which causes rejection.
    """
    parent_map = _parse_caveats(parent_caveats or [])

    for child_caveat in child:
        if "=" not in child_caveat:
            return False  # malformed child caveat
        key, child_value = child_caveat.split("=", 1)
        if not key:
            return False

        parent_value = parent_map.get(key)
        if parent_value is None:
            return False  # parent never granted this caveat

        if key in _NUMERIC_UPPER_BOUND_KEYS:
            try:
                parent_num = float(parent_value)
                child_num = float(child_value)
            except ValueError:
                return False
            if child_num > parent_num + 1e-9:
                return False  # widening
        else:
            if child_value != parent_value:
                return False  # equality mismatch

    return True


def _parse_caveats(caveats: list[str]) -> dict[str, str]:
    """Parse ``["k=v", ...]`` into a dict. Last write wins for duplicate keys."""
    result: dict[str, str] = {}
    for c in caveats:
        if isinstance(c, str) and "=" in c:
            k, v = c.split("=", 1)
            if k:
                result[k] = v
    return result
