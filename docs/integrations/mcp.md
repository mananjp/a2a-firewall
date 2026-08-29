# Model Context Protocol (MCP) Governance Guide — A2A Firewall

Govern and sandbox **Model Context Protocol (MCP)** tool executions for Claude Desktop, Cursor, and custom agent applications using the `a2a_firewall.mcp` gateway.

---

## 🎯 What MCP Governance Solves

When LLMs use MCP tools (e.g. `@anthropic/mcp-server-filesystem` or postgres tools), the model generates tool calls with arbitrary arguments. A prompt injection or malicious model output can:
- Perform **path traversal** (`read_file("../../../etc/shadow")`)
- Execute **destructive bash commands** (`execute_command("rm -rf /")`)
- Inject **malicious SQL queries** (`run_query("DROP TABLE users;--")`)
- Exfiltrate sensitive secrets to unmonitored destinations

The **A2A MCP Tool Gateway** (`Layer 2`) intercepts JSON-RPC 2.0 requests over `stdio` and `HTTP/SSE` before the tool server executes them, synthesizing structured security errors on violations.

```
┌─────────────────┐       JSON-RPC 2.0       ┌──────────────────────┐       Safe Execution       ┌────────────────┐
│  AI Orchestrator│ ───────────────────────► │   A2A MCP Gateway    │ ─────────────────────────► │ Real MCP Tool  │
│  (Claude/Cursor)│ ◄─────────────────────── │ (Policy & Sandbox)   │ ◄───────────────────────── │ Server Process │
└─────────────────┘   JSON-RPC -32000 Block  └──────────────────────┘                            └────────────────┘
```

---

## 💻 1. Claude Desktop Integration

Add the `a2a_firewall.mcp` wrapper to your `claude_desktop_config.json`:

### Configuration:
```json
{
  "mcpServers": {
    "filesystem-governed": {
      "command": "python",
      "args": [
        "-m", "a2a_firewall.mcp", "wrap",
        "--allowed-paths", "/home/user/workspace,/home/user/projects",
        "--blocked-tools", "execute_command,delete_file",
        "--",
        "npx", "-y", "@modelcontextprotocol/server-filesystem", "/home/user/workspace"
      ]
    },
    "postgres-governed": {
      "command": "python",
      "args": [
        "-m", "a2a_firewall.mcp", "wrap",
        "--read-only",
        "--",
        "npx", "-y", "@modelcontextprotocol/server-postgres", "postgresql://user:pass@localhost:5432/analytics"
      ]
    }
  }
}
```

---

## 💻 2. Cursor IDE Integration

In Cursor's **Features &rarr; MCP Servers** settings:

```
Command: python -m a2a_firewall.mcp wrap --allowed-paths /my-repo -- npx @modelcontextprotocol/server-filesystem /my-repo
```

---

## 🛡️ Built-in MCP Security Policies

| Policy Flag | Description | Default |
|:---|:---|:---|
| `--allowed-paths` | Comma-separated list of whitelisted directory roots. Rejects any path traversal attempts escaping these roots. | Root workspace |
| `--blocked-tools` | Blacklisted tool names. Requests are blocked with `-32000` application error. | None |
| `--read-only` | Enforces read-only operations across database and filesystem tools. | `false` |
| `--sql-guard` | Evaluates SQL query arguments against destructive operations and credential dump patterns. | `true` |
| `--shell-guard` | Blocks command chaining (`;`, `&&`, `|`), reverse shells, and download-execute payloads (`curl | sh`). | `true` |

---

## 📊 Error Handling for LLMs

When a tool call is blocked, the gateway returns standard JSON-RPC error `-32000`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32000,
    "message": "A2A Firewall Security Block: Path traversal detected in argument 'path'",
    "data": {
      "tool_name": "read_file",
      "violation_type": "path_traversal",
      "risk_score": 0.95
    }
  }
}
```
This allows the orchestrating LLM to handle the rejection gracefully and continue reasoning without crashing the session.
