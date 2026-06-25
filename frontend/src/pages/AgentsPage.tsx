import { useState, useCallback, type FormEvent } from "react";
import { agents } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import type { Agent, AgentWithKey } from "../api/types";

export default function AgentsPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<{ name: string; api_key: string } | null>(null);

  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<Agent[]>(useCallback((_signal) => agents.list() as Promise<Agent[]>, []), 10000);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = (await agents.register({
        name,
        description: description || undefined,
      })) as AgentWithKey;
      setLastKey({ name: res.name, api_key: res.api_key });
      setName("");
      setDescription("");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onAction(id: string, action: "suspend" | "reactivate" | "rotateKey") {
    try {
      if (action === "rotateKey") {
        const res = await agents.rotateKey(id);
        setLastKey({ name: id.slice(0, 8), api_key: res.api_key });
      } else {
        await agents[action](id);
      }
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Agents</h1>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {loadErr && (
        <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-200">
          {loadErr.message}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-2">Register a new agent</h2>
        <form onSubmit={onSubmit} className="card space-y-3 max-w-2xl">
          <label className="block">
            <span className="text-sm text-slate-300">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="researcher"
              className="input w-full mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-300">Description (optional)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full mt-1"
            />
          </label>
          <button type="submit" disabled={submitting || !name} className="btn-primary">
            {submitting ? "Registering…" : "Register"}
          </button>
        </form>
        {lastKey && (
          <div className="card mt-3 max-w-2xl bg-amber-900/30 border-amber-700">
            <div className="text-sm text-amber-200">
              API key for <span className="font-mono">{lastKey.name}</span> &mdash; copy now, you
              won&apos;t see it again:
            </div>
            <pre className="font-mono text-xs mt-2 p-2 bg-slate-900 rounded overflow-x-auto">
              {lastKey.api_key}
            </pre>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Existing agents</h2>
        {loading && !data && <div className="card text-slate-400 text-sm">Loading…</div>}
        {data && data.length === 0 && (
          <div className="card text-slate-400 text-sm">No agents yet. Register one above.</div>
        )}
        {data && data.length > 0 && (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.id} className="border-t border-slate-700">
                    <td className="px-4 py-2">{a.name}</td>
                    <td className="px-4 py-2">
                      <span className={a.status === "active" ? "badge-allow" : "badge-block"}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-400">
                      {a.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2 space-x-2">
                      {a.status === "active" ? (
                        <button
                          onClick={() => onAction(a.id, "suspend")}
                          className="btn-danger text-xs"
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => onAction(a.id, "reactivate")}
                          className="btn-primary text-xs"
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        onClick={() => onAction(a.id, "rotateKey")}
                        className="btn-ghost text-xs"
                      >
                        Rotate key
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
