import { useState } from "react";
import { Link } from "react-router-dom";
import { tasks, violations } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import type { TaskDetail, Violation } from "../api/types";

export default function ViolationsPage() {
  const [severity, setSeverity] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading, error } = usePolling<Violation[]>(
    (_signal) => violations.list(severity) as Promise<Violation[]>,
    5000,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Violations</h1>
        <div className="flex gap-2 text-sm">
          {["all", "low", "medium", "high", "critical"].map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s === "all" ? undefined : s)}
              className={`px-2 py-1 rounded ${
                (s === "all" && !severity) || s === severity
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-200">
          {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {loading && !data && <div className="card text-slate-400 text-sm">Loading…</div>}
          {data && data.length === 0 && (
            <div className="card text-slate-400 text-sm">No violations match this filter.</div>
          )}
          {data && data.length > 0 && (
            <div className="card overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Severity</th>
                    <th className="px-4 py-2">Layer</th>
                    <th className="px-4 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((v) => (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedId(v.task_id)}
                      className={`border-t border-slate-700 cursor-pointer hover:bg-slate-800 ${
                        selectedId === v.task_id ? "bg-slate-800" : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-xs">{v.violation_type}</td>
                      <td className="px-4 py-2">
                        <span className={`badge-${v.severity}`}>{v.severity}</span>
                      </td>
                      <td className="px-4 py-2">{v.layer}</td>
                      <td className="px-4 py-2 text-xs text-slate-400">
                        {new Date(v.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="lg:col-span-1">
          <ViolationDetail taskId={selectedId} />
        </div>
      </div>
    </div>
  );
}

function ViolationDetail({ taskId }: { taskId: string | null }) {
  const { data: task, loading } = usePolling<TaskDetail | null>(
    (_signal) => (taskId ? tasks.get(taskId).then((t) => t as TaskDetail) : Promise.resolve(null)),
    5000,
    !!taskId,
  );

  if (!taskId) {
    return (
      <div className="card text-slate-400 text-sm">Select a violation to see its task detail.</div>
    );
  }
  if (loading && !task) return <div className="card text-slate-400 text-sm">Loading…</div>;
  if (!task) return <div className="card text-slate-400 text-sm">Task not found.</div>;

  return (
    <div className="card space-y-3">
      <div>
        <div className="text-xs text-slate-400 uppercase">Decision</div>
        <div>
          <span className={`badge-${task.decision}`}>{task.decision}</span>
          <span className="ml-2 text-sm text-slate-300">risk {task.risk_score.toFixed(2)}</span>
        </div>
      </div>
      {task.trace_id && (
        <div>
          <div className="text-xs text-slate-400 uppercase">Trace</div>
          <Link
            to={`/traces/${task.trace_id}`}
            className="text-blue-400 text-sm hover:underline font-mono"
          >
            {task.trace_id.slice(0, 16)}…
          </Link>
        </div>
      )}
      <div>
        <div className="text-xs text-slate-400 uppercase">Violations</div>
        <ul className="text-sm space-y-1 mt-1">
          {task.violations.map((v, i) => (
            <li key={i} className="font-mono text-xs">
              <span className={`badge-${v.severity} mr-1`}>{v.severity}</span>
              {v.type} <span className="text-slate-500">({v.layer})</span>
            </li>
          ))}
        </ul>
      </div>
      {task.groq_rationale && (
        <div>
          <div className="text-xs text-slate-400 uppercase">Groq rationale</div>
          <div className="text-sm text-slate-300 italic mt-1">{task.groq_rationale}</div>
        </div>
      )}
    </div>
  );
}
