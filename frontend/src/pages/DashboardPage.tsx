import { Link } from "react-router-dom";
import { violations } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import type { Violation } from "../api/types";

export default function DashboardPage() {
  const {
    data: violationData,
    loading,
    error,
  } = usePolling<Violation[]>(
    (_signal) => violations.list(undefined).then((r) => r as unknown as Violation[]),
    5000,
    true,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-200">
          Failed to load: {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total violations" value={violationData?.length ?? 0} />
        <StatCard
          title="Most recent"
          value={
            violationData && violationData.length > 0
              ? new Date(violationData[0].created_at).toLocaleTimeString()
              : "—"
          }
        />
        <StatCard title="Polling interval" value="5s" />
        <StatCard title="Status" value={loading ? "loading…" : "live"} />
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">Recent violations</h2>
        {violationData && violationData.length > 0 ? (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Severity</th>
                  <th className="px-4 py-2">Layer</th>
                  <th className="px-4 py-2">Task</th>
                  <th className="px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {violationData.slice(0, 20).map((v) => (
                  <tr key={v.id} className="border-t border-slate-700 hover:bg-slate-800">
                    <td className="px-4 py-2 font-mono text-xs">{v.violation_type}</td>
                    <td className="px-4 py-2">
                      <span className={`badge-${v.severity}`}>{v.severity}</span>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{v.layer}</td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link to={`/violations`} className="text-blue-400 hover:underline">
                        {v.task_id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-xs">
                      {new Date(v.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card text-slate-400 text-sm">
            No violations yet. Trigger an attack via the SDK demo to populate this feed.
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-400 uppercase tracking-wide">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
