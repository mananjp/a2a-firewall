import { useState, useCallback, type FormEvent } from "react";
import { policies } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import type { Policy, PolicyAction } from "../api/types";

const ACTIONS: PolicyAction[] = ["allow", "block", "review", "flag"];

export default function PoliciesPage() {
  const [priority, setPriority] = useState("100");
  const [name, setName] = useState("");
  const [action, setAction] = useState<PolicyAction>("block");
  const [taskType, setTaskType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<Policy[]>(useCallback((_signal) => policies.list() as Promise<Policy[]>, []), 10000);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await policies.create({
        priority: Number(priority),
        name,
        action,
        task_type: taskType || undefined,
      });
      setName("");
      setTaskType("");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await policies.delete(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Policies</h1>

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
        <h2 className="text-lg font-semibold mb-2">New policy</h2>
        <form onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Priority</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              required
              className="input w-full mt-1"
            />
          </label>
          <label className="block md:col-span-1">
            <span className="text-xs text-slate-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="block external IPs"
              className="input w-full mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Action</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as PolicyAction)}
              className="input w-full mt-1"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Task type (optional)</span>
            <input
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              placeholder="research"
              className="input w-full mt-1"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || !name}
            className="btn-primary md:col-span-4"
          >
            {submitting ? "Adding…" : "Add policy"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Active policies</h2>
        {loading && !data && <div className="card text-slate-400 text-sm">Loading…</div>}
        {data && data.length === 0 && (
          <div className="card text-slate-400 text-sm">No policies defined.</div>
        )}
        {data && data.length > 0 && (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Task type</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...data]
                  .sort((a, b) => a.priority - b.priority)
                  .map((p) => (
                    <tr key={p.id} className="border-t border-slate-700">
                      <td className="px-4 py-2 font-mono">{p.priority}</td>
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2">
                        <span className={`badge-${p.action === "block" ? "block" : "allow"}`}>
                          {p.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">{p.task_type ?? "—"}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => onDelete(p.id)} className="btn-danger text-xs">
                          Delete
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
