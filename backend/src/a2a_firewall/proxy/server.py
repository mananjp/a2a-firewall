"""A2A Transparent TLS-Intercepting Proxy Server.

Asynchronous forwarding proxy that intercepts HTTPS CONNECT tunnels and plain HTTP traffic,
terminates TLS with dynamic certificates from CertificateAuthority, normalizes AI payloads,
runs inspection, and blocks or forwards traffic.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import urllib.parse
from collections.abc import Callable, Coroutine
from typing import Any

import httpx

from a2a_firewall.detection.ips_signatures import SignatureEngine
from a2a_firewall.detection.layer3_rules import (
    INJECTION_PATTERNS,
    SQL_INJECTION_PATTERNS,
)
from a2a_firewall.detection.pii_patterns import pii_matches_to_violations, scan_all_pii
from a2a_firewall.proxy.ca import CertificateAuthority
from a2a_firewall.proxy.normalizer import AIRequestNormalizer, NormalizedAIRequest

logger = logging.getLogger("a2a_firewall.proxy")


class A2AProxyServer:
    """Async TLS-Intercepting Proxy for AI Traffic Governance."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 8080,
        ca: CertificateAuthority | None = None,
        inspect_callback: Callable[[NormalizedAIRequest], Coroutine[Any, Any, dict[str, Any]]]
        | None = None,
        fail_mode: str = "closed",  # "closed" or "open"
        process_registry: Any = None,
    ):
        self.host = host
        self.port = port
        self.ca = ca or CertificateAuthority()
        self.inspect_callback = inspect_callback
        self.fail_mode = fail_mode
        self.process_registry = process_registry
        self._server: asyncio.Server | None = None
        self._running = False

    async def start(self) -> None:
        """Start the proxy server."""
        self._server = await asyncio.start_server(
            self._handle_client_connection,
            self.host,
            self.port,
        )
        self._running = True
        logger.info(f"A2A Proxy listening on http://{self.host}:{self.port}")
        logger.info(f"Root CA cert located at: {self.ca.root_cert_path}")

    async def stop(self) -> None:
        """Stop the proxy server."""
        self._running = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            logger.info("A2A Proxy stopped.")

    async def _handle_health_check(self, client_writer: asyncio.StreamWriter) -> None:
        """Respond to health/readiness probes for Docker/K8s orchestrators."""
        body = json.dumps(
            {
                "status": "healthy",
                "ca_ready": self.ca._root_cert is not None,
                "proxy_running": self._running,
            }
        ).encode("utf-8")
        response = (
            b"HTTP/1.1 200 OK\r\n"
            b"Content-Type: application/json\r\n"
            b"Content-Length: " + str(len(body)).encode() + b"\r\n"
            b"Connection: close\r\n"
            b"\r\n" + body
        )
        client_writer.write(response)
        await client_writer.drain()

    async def _handle_client_connection(
        self,
        client_reader: asyncio.StreamReader,
        client_writer: asyncio.StreamWriter,
    ) -> None:
        """Handle raw incoming TCP connection from client."""
        try:
            # Read request line
            line_bytes = await client_reader.readline()
            if not line_bytes:
                return

            request_line = line_bytes.decode("utf-8", errors="replace").strip()
            parts = request_line.split()
            if len(parts) < 3:
                return

            method, target, version = parts[0], parts[1], parts[2]

            # Health check endpoint — responds directly without proxying
            if method.upper() == "GET" and target in ("/healthz", "/health", "/readyz"):
                await self._handle_health_check(client_writer)
                return

            # Case 1: HTTPS CONNECT Tunnel
            if method.upper() == "CONNECT":
                await self._handle_connect_tunnel(target, client_reader, client_writer)
            else:
                # Case 2: Plain HTTP Proxying
                await self._handle_plain_http(method, target, version, client_reader, client_writer)

        except Exception as e:
            logger.exception(f"Client connection error: {e}")
        finally:
            try:
                client_writer.close()
                await client_writer.wait_closed()
            except Exception:
                pass

    async def _handle_connect_tunnel(
        self,
        target: str,
        client_reader: asyncio.StreamReader,
        client_writer: asyncio.StreamWriter,
    ) -> None:
        """Handle HTTPS CONNECT tunneling with TLS MITM termination."""
        if ":" in target:
            target_host, target_port_str = target.split(":", 1)
            target_port = int(target_port_str)
        else:
            target_host = target
            target_port = 443

        # Read the rest of the CONNECT request headers (until empty line)
        while True:
            header_line = await client_reader.readline()
            if not header_line or header_line in (b"\r\n", b"\n"):
                break

        # 1. Send HTTP 200 Connection Established to client
        client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        await client_writer.drain()
        logger.info(f"CONNECT tunnel established for {target_host}:{target_port}")

        # 2. Get dynamic SSL Context for target_host
        server_ssl_ctx = self.ca.get_ssl_context_for_host(target_host)

        # 3. Upgrade client socket to TLS
        loop = asyncio.get_running_loop()
        transport = client_writer.transport
        protocol = client_writer._protocol  # type: ignore[attr-defined]

        try:
            tls_transport = await loop.start_tls(
                transport=transport,
                protocol=protocol,
                sslcontext=server_ssl_ctx,
                server_side=True,
            )
            client_writer._transport = tls_transport  # type: ignore[attr-defined]
            logger.info(f"TLS handshake completed with client for {target_host}")
        except Exception as e:
            logger.exception(f"TLS handshake failed for {target_host}: {e}")
            return

        # Read intercepted HTTP request over TLS
        req_line_bytes = await client_reader.readline()
        if not req_line_bytes:
            logger.info("Empty request line after TLS handshake")
            return

        req_line = req_line_bytes.decode("utf-8", errors="replace").strip()
        logger.info(f"Intercepted TLS request: {req_line}")
        parts = req_line.split()
        if len(parts) < 3:
            return

        method, path, _version = parts[0], parts[1], parts[2]
        headers, body_bytes = await self._read_headers_and_body(client_reader)

        # Transparent-mode host resolution: when a connection was REDIRECTed to
        # the proxy by iptables, the CONNECT target is the proxy itself
        # (127.0.0.1:8080), not the origin. The real origin is carried in the
        # HTTP Host header, which we must trust to reach the correct upstream.
        resolved_host, resolved_port = target_host, target_port
        http_host = headers.get("host")
        if http_host:
            host_part, _, port_part = http_host.partition(":")
            if host_part and host_part not in ("127.0.0.1", "localhost", "0.0.0.0"):
                resolved_host = host_part
                if port_part:
                    resolved_port = int(port_part)
                elif target_port in (80,) or path.startswith("http://"):
                    resolved_port = 80

        # Normalize request
        normalized = AIRequestNormalizer.normalize(
            method=method,
            path=path,
            headers=headers,
            body_bytes=body_bytes,
        )
        # Attach host for downstream enterprise inspection.
        normalized.host = resolved_host
        self._attribute_identity(normalized, client_writer)

        # Run Inspection
        inspection_res = await self._inspect_request(normalized)
        logger.info(f"Inspection decision for {path}: {inspection_res.get('decision')}")

        if inspection_res.get("decision") == "block":
            # Block request! Send HTTP 403 Forbidden
            await self._send_blocked_response(client_writer, inspection_res)
            logger.info("Sent 403 blocked response")
            return

        # Forward to upstream target
        await self._forward_upstream_https(
            target_host=resolved_host,
            target_port=resolved_port,
            method=method,
            path=path,
            headers=headers,
            body_bytes=body_bytes,
            client_writer=client_writer,
        )

    async def _handle_plain_http(
        self,
        method: str,
        target_url: str,
        version: str,
        client_reader: asyncio.StreamReader,
        client_writer: asyncio.StreamWriter,
    ) -> None:
        """Handle plain HTTP proxy requests."""
        headers, body_bytes = await self._read_headers_and_body(client_reader)

        parsed = urllib.parse.urlparse(target_url)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"

        normalized = AIRequestNormalizer.normalize(
            method=method,
            path=path,
            headers=headers,
            body_bytes=body_bytes,
        )
        self._attribute_identity(normalized, client_writer)

        inspection_res = await self._inspect_request(normalized)
        if inspection_res.get("decision") == "block":
            await self._send_blocked_response(client_writer, inspection_res)
            return

        # Forward plain HTTP
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.request(
                method=method,
                url=target_url,
                headers={
                    k: v
                    for k, v in headers.items()
                    if k.lower() not in ("host", "proxy-connection")
                },
                content=body_bytes,
            )
            client_writer.write(f"HTTP/1.1 {resp.status_code} {resp.reason_phrase}\r\n".encode())
            for k, v in resp.headers.items():
                if k.lower() not in ("transfer-encoding", "content-length"):
                    client_writer.write(f"{k}: {v}\r\n".encode())
            client_writer.write(f"Content-Length: {len(resp.content)}\r\n\r\n".encode())
            client_writer.write(resp.content)
            await client_writer.drain()

    async def _read_headers_and_body(
        self,
        reader: asyncio.StreamReader,
    ) -> tuple[dict[str, str], bytes]:
        """Read HTTP headers and body from stream."""
        headers: dict[str, str] = {}
        content_length = 0

        while True:
            line_bytes = await reader.readline()
            if not line_bytes or line_bytes in (b"\r\n", b"\n"):
                break
            line_str = line_bytes.decode("utf-8", errors="replace").strip()
            if ":" in line_str:
                k, v = line_str.split(":", 1)
                headers[k.strip().lower()] = v.strip()
                if k.strip().lower() == "content-length":
                    with contextlib.suppress(ValueError):
                        content_length = int(v.strip())

        body_bytes = b""
        if content_length > 0:
            body_bytes = await reader.readexactly(content_length)

        return headers, body_bytes

    def _attribute_identity(self, req: NormalizedAIRequest, writer: asyncio.StreamWriter) -> None:
        """Tag a normalized request with the initiating process identity.

        When a :class:`~a2a_firewall.egress_guard.process_registry.ProcessRegistry`
        is configured, resolves the peer PID from the accepted socket
        (``SO_PEERCRED`` on Linux) and stamps the real ``agent_id`` /
        ``workspace_id`` so downstream enterprise inspection attributes the
        request to a real agent rather than a random UUID. Best-effort: if the
        PID cannot be resolved or is not registered, the request stays
        unattributed (the built-in allow-marking handles it).
        """
        if self.process_registry is None:
            return
        sock = writer.get_extra_info("socket")
        if sock is None:
            return
        fileno = sock.fileno() if hasattr(sock, "fileno") else sock
        if not isinstance(fileno, int):
            return
        from a2a_firewall.egress_guard.process_registry import resolve_peer_identity

        identity = resolve_peer_identity(fileno, self.process_registry)
        if identity is None:
            return
        req.peer_pid = identity.pid
        req.agent_id = identity.agent_id
        req.workspace_id = identity.workspace_id

    async def _inspect_request(self, req: NormalizedAIRequest) -> dict[str, Any]:
        """Execute inspection policy on normalized request."""
        # 1. Custom callback if configured
        if self.inspect_callback:
            try:
                return await self.inspect_callback(req)
            except Exception as e:
                logger.error(f"Inspect callback failed: {e}")
                if self.fail_mode == "closed":
                    return {
                        "decision": "block",
                        "block_reason": f"inspection_error: {e}",
                        "risk_score": 1.0,
                        "violations": [
                            {"layer": "system", "violation_type": "proxy_inspection_error"}
                        ],
                    }
                return {"decision": "allow", "risk_score": 0.0, "violations": []}

        # 2. Built-in Deterministic Fast Gate
        violations: list[dict[str, Any]] = []

        # Layer 0: Payload size preflight
        payload_bytes_len = len(json.dumps(req.payload).encode("utf-8"))
        if payload_bytes_len > 1_048_576:
            return {
                "decision": "block",
                "block_reason": "payload_too_large",
                "risk_score": 1.0,
                "violations": [{"layer": "preflight", "violation_type": "payload_too_large"}],
                "task_id": req.task_id,
            }

        # Scan text for IPS signatures
        text_to_scan = req.extracted_text or json.dumps(req.payload)
        sig_engine = SignatureEngine()
        ips_hits = sig_engine.scan(text_to_scan)
        for hit in ips_hits:
            violations.append(
                {
                    "layer": "rule",
                    "violation_type": f"ips_signature_{hit['signature_id']}",
                    "severity": hit.get("severity", "critical"),
                    "details": hit,
                }
            )

        # Scan for PII leaks
        pii_matches = scan_all_pii(text_to_scan)
        if pii_matches:
            violations.extend(pii_matches_to_violations(pii_matches))

        # Scan injection patterns
        payload_str = (text_to_scan + " " + json.dumps(req.payload)).lower()
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, payload_str, re.IGNORECASE):
                violations.append(
                    {
                        "layer": "rule",
                        "violation_type": "forbidden_pattern",
                        "severity": "high",
                        "details": {"pattern": pattern},
                    }
                )

        # Scan SQL injection patterns
        for pattern, vtype, _ in SQL_INJECTION_PATTERNS:
            if re.search(pattern, payload_str, re.IGNORECASE):
                violations.append(
                    {
                        "layer": "rule",
                        "violation_type": "sql_injection",
                        "severity": "critical",
                        "details": {"pattern": pattern, "subtype": vtype},
                    }
                )

        if violations:
            return {
                "decision": "block",
                "block_reason": violations[0]["violation_type"],
                "risk_score": 1.0
                if any(v.get("severity") == "critical" for v in violations)
                else 0.9,
                "violations": violations,
                "task_id": req.task_id,
            }

        return {
            "decision": "allow",
            "risk_score": 0.0,
            "violations": [],
            "task_id": req.task_id,
        }

    async def _send_blocked_response(
        self,
        writer: asyncio.StreamWriter,
        inspection_res: dict[str, Any],
    ) -> None:
        """Send HTTP 403 Forbidden with security block payload."""
        block_payload = {
            "error": {
                "message": f"A2A Firewall Security Block: {inspection_res.get('block_reason', 'policy_violation')}",
                "type": "a2a_firewall_blocked",
                "task_id": inspection_res.get("task_id"),
                "risk_score": inspection_res.get("risk_score", 1.0),
                "violations": inspection_res.get("violations", []),
            }
        }
        body = json.dumps(block_payload, indent=2).encode("utf-8")
        resp_headers = (
            "HTTP/1.1 403 Forbidden\r\n"
            "Content-Type: application/json\r\n"
            "Server: A2A-Firewall-Proxy/0.2.0\r\n"
            "Connection: close\r\n"
            f"Content-Length: {len(body)}\r\n\r\n"
        ).encode()
        writer.write(resp_headers + body)
        await writer.drain()

    async def _forward_upstream_https(
        self,
        target_host: str,
        target_port: int,
        method: str,
        path: str,
        headers: dict[str, str],
        body_bytes: bytes,
        client_writer: asyncio.StreamWriter,
    ) -> None:
        """Forward decrypted request to upstream HTTPS endpoint."""
        url = f"https://{target_host}:{target_port}{path}"

        # Clean headers for forwarding
        forward_headers = {
            k: v
            for k, v in headers.items()
            if k.lower() not in ("host", "proxy-connection", "transfer-encoding")
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await client.request(
                    method=method,
                    url=url,
                    headers=forward_headers,
                    content=body_bytes,
                )

                # ---------- Response inspection (upstream → agent) ----------
                response_decision: dict[str, Any] | None = None
                try:
                    from a2a_firewall.proxy.response_scanner import scan_response_body

                    response_decision = scan_response_body(resp.content)
                except Exception:
                    response_decision = None

                if response_decision and response_decision.get("decision") == "block":
                    # Do not forward a malicious/leaky response; return a block.
                    await self._send_upstream_blocked_response(client_writer)
                    return

                forwarded_body = resp.content
                if response_decision and response_decision.get("redacted_body"):
                    forwarded_body = str(response_decision["redacted_body"]).encode("utf-8")

                # Return upstream response to client
                client_writer.write(
                    f"HTTP/1.1 {resp.status_code} {resp.reason_phrase}\r\n".encode()
                )
                for k, v in resp.headers.items():
                    if k.lower() not in ("transfer-encoding", "content-length", "content-encoding"):
                        client_writer.write(f"{k}: {v}\r\n".encode())

                client_writer.write(f"Content-Length: {len(forwarded_body)}\r\n".encode())
                client_writer.write(b"X-A2A-Firewall-Inspected: true\r\n\r\n")
                client_writer.write(forwarded_body)
                await client_writer.drain()

            except Exception as e:
                err_body = json.dumps(
                    {"error": {"message": f"Upstream connection failed: {e}"}}
                ).encode("utf-8")
                err_resp_headers = (
                    "HTTP/1.1 502 Bad Gateway\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {len(err_body)}\r\n\r\n"
                ).encode()
                client_writer.write(err_resp_headers + err_body)
                await client_writer.drain()

    async def _send_upstream_blocked_response(self, writer: asyncio.StreamWriter) -> None:
        """Send an HTTP 403 block for a response rejected by inspection."""
        body = json.dumps(
            {
                "error": {
                    "message": "A2A Firewall Security Block: upstream response failed inspection",
                    "type": "a2a_firewall_blocked_response",
                }
            }
        ).encode("utf-8")
        resp = (
            b"HTTP/1.1 403 Forbidden\r\n"
            b"Content-Type: application/json\r\n"
            b"X-A2A-Firewall-Inspected: true\r\n"
            b"Connection: close\r\n"
            b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
        )
        writer.write(resp)
        await writer.drain()
