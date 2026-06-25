import { useState } from "react";
import { review } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import type { ReviewItem } from "../api/types";

export default function ReviewQueuePage() {
  const [error, setError] = useState<string | null>(null);
  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<ReviewItem[]>(() => review.list() as Promise<ReviewItem[]>, 5000);

  async function onDecide(token: string, action: "approve" | "reject") {
    setError(null);
    try {
      await review.decide(token, action);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Review queue</h1>

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

      {loading && !data && <div className="card text-slate-400 text-sm">Loading…</div>}
      {data && data.length === 0 && (
        <div className="card text-slate-400 text-sm">
          No pending reviews. Tasks with risk between review and block thresholds land here.
        </div>
      )}
      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((r) => (
            <div key={r.id} className="card flex items-center justify-between">
              <div>
                <div className="text-sm">
                  Task <span className="font-mono text-xs">{r.task_id}</span>
                </div>
                <div className="text-xs text-slate-400">
                  Token <span className="font-mono">{r.review_token.slice(0, 12)}…</span> · expires{" "}
                  {new Date(r.expires_at).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDecide(r.review_token, "approve")}
                  className="btn-primary text-xs"
                >
                  Approve
                </button>
                <button
                  onClick={() => onDecide(r.review_token, "reject")}
                  className="btn-danger text-xs"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
