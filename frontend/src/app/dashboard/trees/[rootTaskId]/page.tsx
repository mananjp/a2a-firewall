"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { tasks } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { LineageNode } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { GitBranch } from "lucide-react";

const DECISION_BG: Record<string, string> = {
  allow: "#052e16",
  block: "#450a0a",
  review: "#451a03",
  error: "#18181b",
};

const DECISION_BORDER: Record<string, string> = {
  allow: "#22c55e",
  block: "#ef4444",
  review: "#f59e0b",
  error: "#52525b",
};

export default function TreeViewPage() {
  const { rootTaskId } = useParams<{ rootTaskId: string }>();

  const fetcher = useCallback(
    (_signal: AbortSignal) =>
      tasks.lineage(rootTaskId ?? "").then((r) => r as LineageNode[]),
    [rootTaskId]
  );

  const { data, loading, error } = usePolling<LineageNode[]>(
    fetcher,
    5000,
    !!rootTaskId
  );

  if (!rootTaskId) {
    return <Card>No root_task_id in URL.</Card>;
  }
  if (loading && !data) {
    return <Card className="text-muted">Loading tree...</Card>;
  }
  if (error) {
    return <Card className="text-danger">{error.message}</Card>;
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch size={24} />}
        title="Empty tree"
      />
    );
  }

  // Layout: horizontal BFS by depth
  const maxDepth = Math.max(...data.map((n) => n.depth));
  const cols: LineageNode[][] = Array.from(
    { length: maxDepth + 1 },
    () => []
  );
  for (const n of data) cols[n.depth].push(n);
  for (const col of cols) col.sort((a, b) => a.id.localeCompare(b.id));

  const nodes: Node[] = data.map((n) => {
    const col = cols[n.depth];
    const y = col.indexOf(n) * 110 + 20;
    return {
      id: n.id,
      position: { x: n.depth * 260 + 40, y },
      data: {
        label: (
          <div className="text-left p-1">
            <div className="text-[10px] font-mono text-muted-foreground">
              depth {n.depth}
            </div>
            <div className="text-xs font-mono text-foreground">
              {n.task_type}
            </div>
            <div className="mt-1">
              <span
                className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-mono uppercase"
                style={{
                  background:
                    n.decision === "allow"
                      ? "rgba(34,197,94,0.15)"
                      : n.decision === "block"
                      ? "rgba(239,68,68,0.15)"
                      : "rgba(245,158,11,0.15)",
                  color:
                    n.decision === "allow"
                      ? "#22c55e"
                      : n.decision === "block"
                      ? "#ef4444"
                      : "#f59e0b",
                }}
              >
                {n.decision}
              </span>
            </div>
          </div>
        ),
      },
      style: {
        background: DECISION_BG[n.decision],
        color: "#fff",
        border: `1.5px solid ${DECISION_BORDER[n.decision]}`,
        borderRadius: 8,
        width: 180,
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
      style: { stroke: "#52525b" },
    }));

  return (
    <div>
      <PageHeader title="Execution Tree" />
      <div className="mb-2 text-xs font-mono text-muted-foreground">
        root: {rootTaskId}
      </div>
      <Card className="p-0" style={{ height: 500 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#27272a" />
          <Controls />
        </ReactFlow>
      </Card>
      <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
        {(["allow", "block", "review"] as const).map((d) => (
          <span key={d} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: DECISION_BORDER[d] }}
            />
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
