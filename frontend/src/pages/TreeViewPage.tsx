import { useCallback } from "react";
import { useParams } from "react-router-dom";
import ReactFlow, { Background, Controls, MarkerType, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import { tasks } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import type { LineageNode } from "../api/types";

export default function TreeViewPage() {
  const { rootTaskId } = useParams<{ rootTaskId: string }>();

  const fetcher = useCallback(
    (_signal: AbortSignal) => tasks.lineage(rootTaskId ?? "").then((r) => r as LineageNode[]),
    [rootTaskId],
  );

  const { data, loading, error } = usePolling<LineageNode[]>(fetcher, 5000, !!rootTaskId);

  if (!rootTaskId) return <div className="card">No root_task_id in URL.</div>;
  if (loading && !data) return <div className="card text-slate-400">Loading tree…</div>;
  if (error) return <div className="card text-red-300">{error.message}</div>;
  if (!data || data.length === 0) return <div className="card text-slate-400">Empty tree.</div>;

  // Layout: simple horizontal BFS by depth. Each depth gets its own column.
  const maxDepth = Math.max(...data.map((n) => n.depth));
  const cols: LineageNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (const n of data) cols[n.depth].push(n);
  for (const col of cols) {
    col.sort((a, b) => a.id.localeCompare(b.id));
  }

  const nodes: Node[] = data.map((n) => {
    const col = cols[n.depth];
    const y = col.indexOf(n) * 110 + 20;
    return {
      id: n.id,
      position: { x: n.depth * 260 + 40, y },
      data: {
        label: (
          <div className="text-left">
            <div className="text-xs font-mono opacity-70">depth {n.depth}</div>
            <div className="font-mono text-xs">{n.task_type}</div>
            <div className={`badge-${n.decision} mt-1`}>{n.decision}</div>
          </div>
        ),
      },
      style: {
        background: DECISION_BG[n.decision],
        color: "#fff",
        border: `2px solid ${DECISION_BORDER[n.decision]}`,
        borderRadius: 8,
        padding: 8,
        width: 200,
      },
    };
  });

  const edges: Edge[] = data
    .filter((n) => n.parent_task_id)
    .map((n) => ({
      id: `${n.parent_task_id}->${n.id}`,
      source: n.parent_task_id!,
      target: n.id,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#64748b" },
    }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Execution tree</h1>
      <div className="text-xs text-slate-400 font-mono">root: {rootTaskId}</div>
      <div className="card p-0" style={{ height: 600 }}>
        <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
          <Background gap={16} />
          <Controls />
        </ReactFlow>
      </div>
      <div className="flex gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: DECISION_BG.allow }} />
          allow
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: DECISION_BG.block }} />
          block
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm" style={{ background: DECISION_BG.review }} />
          review
        </span>
      </div>
    </div>
  );
}

const DECISION_BG: Record<string, string> = {
  allow: "#065f46",
  block: "#7f1d1d",
  review: "#78350f",
  error: "#1e293b",
};

const DECISION_BORDER: Record<string, string> = {
  allow: "#10b981",
  block: "#ef4444",
  review: "#f59e0b",
  error: "#64748b",
};
