"""Security policy evaluation engine for MCP tool and resource execution."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from a2a_firewall.detection.ips_signatures import SignatureEngine
from a2a_firewall.detection.layer3_rules import INJECTION_PATTERNS, SQL_INJECTION_PATTERNS
from a2a_firewall.mcp.models import MCPPolicy, MCPToolCall


@dataclass
class MCPDecision:
    """Outcome of MCP policy evaluation."""

    allowed: bool
    violation_type: str | None = None
    reason: str | None = None
    risk_score: float = 0.0
    details: dict[str, Any] = field(default_factory=dict)


class MCPPolicyEngine:
    """Evaluates MCP tool calls and resource accesses against security policies."""

    def __init__(self, policy: MCPPolicy | None = None):
        self.policy = policy or MCPPolicy()
        self.sig_engine = SignatureEngine()

    def evaluate_tool_call(self, tool_call: MCPToolCall) -> MCPDecision:
        """Evaluate a tool invocation against security constraints."""
        tool_name = tool_call.name
        args = tool_call.arguments
        args_str = json.dumps(args, sort_keys=True)

        # 1. Blocked tools list check
        if tool_name in self.policy.blocked_tools:
            return MCPDecision(
                allowed=False,
                violation_type="blocked_tool_execution",
                reason=f"Tool '{tool_name}' is explicitly blocked by policy.",
                risk_score=1.0,
                details={"tool": tool_name},
            )

        # 2. Allowed tools whitelist check
        if self.policy.allowed_tools is not None and tool_name not in self.policy.allowed_tools:
            return MCPDecision(
                allowed=False,
                violation_type="unauthorized_tool_execution",
                reason=f"Tool '{tool_name}' is not in the allowed tools whitelist.",
                risk_score=0.9,
                details={"tool": tool_name, "allowed_tools": self.policy.allowed_tools},
            )

        # 3. Read-only mode enforcement
        if self.policy.read_only_mode:
            mutating_keywords = [
                "write",
                "delete",
                "remove",
                "create",
                "update",
                "exec",
                "run",
                "drop",
                "modify",
            ]
            if any(kw in tool_name.lower() for kw in mutating_keywords):
                return MCPDecision(
                    allowed=False,
                    violation_type="read_only_violation",
                    reason=f"Tool '{tool_name}' mutates state but system is in read-only mode.",
                    risk_score=0.8,
                    details={"tool": tool_name},
                )

        # 4. Path Traversal and Sandbox Escape Checks
        path_violation = self._check_path_sandbox(args)
        if path_violation:
            return path_violation

        # 5. Dangerous Command Regex Checks
        cmd_violation = self._check_dangerous_commands(args)
        if cmd_violation:
            return cmd_violation

        # 6. Scan Arguments for Injection and Exploits
        if self.policy.scan_arguments_for_attacks:
            attack_violation = self._scan_argument_attacks(args_str)
            if attack_violation:
                return attack_violation

        return MCPDecision(allowed=True, risk_score=0.0)

    def _check_path_sandbox(self, args: dict[str, Any]) -> MCPDecision | None:
        """Verify file paths do not escape sandbox or target sensitive system files."""
        path_keys = ["path", "filepath", "file", "filename", "dir", "directory", "dest", "source"]
        sensitive_patterns = [
            r"\.\./|\.\.\\",  # Relative traversal
            r"(?i)/etc/(shadow|passwd|sudoers)",
            r"(?i)/root/|/var/run/",
            r"(?i)C:\\Windows\\System32",
            r"(?i)\.ssh/(id_rsa|authorized_keys|id_ed25519)",
            r"(?i)\.aws/(credentials|config)",
            r"(?i)\.env\b",
        ]

        def _scan_obj(val: Any) -> MCPDecision | None:
            if isinstance(val, str):
                for pattern in sensitive_patterns:
                    if re.search(pattern, val):
                        return MCPDecision(
                            allowed=False,
                            violation_type="path_traversal_attack",
                            reason=f"Argument contains unauthorized path or traversal: '{val}'",
                            risk_score=1.0,
                            details={"matched_pattern": pattern, "value": val},
                        )
                # Check allowed paths if configured
                if self.policy.allowed_paths and (":" in val or "/" in val or "\\" in val):
                    try:
                        resolved = Path(val).resolve()
                        if not any(
                            str(resolved).startswith(str(Path(p).resolve()))
                            for p in self.policy.allowed_paths
                        ):
                            return MCPDecision(
                                allowed=False,
                                violation_type="sandbox_path_violation",
                                reason=f"Path '{val}' is outside allowed sandbox paths.",
                                risk_score=0.85,
                                details={"path": val, "allowed_paths": self.policy.allowed_paths},
                            )
                    except Exception:
                        pass
            elif isinstance(val, dict):
                for v in val.values():
                    res = _scan_obj(v)
                    if res:
                        return res
            elif isinstance(val, list):
                for item in val:
                    res = _scan_obj(item)
                    if res:
                        return res
            return None

        for k, v in args.items():
            if any(pk in k.lower() for pk in path_keys) or isinstance(v, (str, dict, list)):
                res = _scan_obj(v)
                if res:
                    return res
        return None

    def _check_dangerous_commands(self, args: dict[str, Any]) -> MCPDecision | None:
        """Check for destructive shell commands."""

        def _scan_str(val: str) -> MCPDecision | None:
            for pattern in self.policy.blocked_commands_regex:
                if re.search(pattern, val, re.IGNORECASE):
                    return MCPDecision(
                        allowed=False,
                        violation_type="destructive_command_execution",
                        reason=f"Command matches destructive pattern: '{pattern}'",
                        risk_score=1.0,
                        details={"pattern": pattern, "command_snippet": val[:120]},
                    )
            return None

        for _, v in args.items():
            if isinstance(v, str):
                res = _scan_str(v)
                if res:
                    return res
        return None

    def _scan_argument_attacks(self, args_str: str) -> MCPDecision | None:
        """Scan tool arguments against IPS signatures and SQLi/Prompt Injection rules."""
        # 1. IPS Signatures
        ips_hits = self.sig_engine.scan(args_str)
        for hit in ips_hits:
            if hit.get("severity") in ("critical", "high"):
                return MCPDecision(
                    allowed=False,
                    violation_type=f"ips_signature_{hit['signature_id']}",
                    reason=f"Tool argument triggered IPS signature: {hit.get('description', '')}",
                    risk_score=1.0,
                    details=hit,
                )

        # 2. SQL Injection Patterns
        for pattern, vtype, prisk in SQL_INJECTION_PATTERNS:
            if re.search(pattern, args_str, re.IGNORECASE):
                return MCPDecision(
                    allowed=False,
                    violation_type="sql_injection",
                    reason=f"Tool argument contains SQL injection pattern ({vtype})",
                    risk_score=prisk,
                    details={"subtype": vtype, "pattern": pattern},
                )

        # 3. Prompt Injection Patterns
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, args_str, re.IGNORECASE):
                return MCPDecision(
                    allowed=False,
                    violation_type="prompt_injection",
                    reason="Tool argument contains prompt injection directive.",
                    risk_score=0.9,
                    details={"pattern": pattern},
                )

        return None
