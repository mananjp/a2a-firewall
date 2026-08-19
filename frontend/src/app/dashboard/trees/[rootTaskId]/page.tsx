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
import { CardSkeleton } from "@/components/ui/skeleton";
import { GitBranch, Loader2 } from "lucide-react";

// Warm-light palette — solid colors for node backgrounds
const DECISION_BG: Record<string, string> = {
  allow:  "#e3eedf",
  block:  "#f4e1de",
  review: "#f6ead0",
  error:  "#f3ede2",
};

const DECISION_BORDER: Record<string, string> = {
  allow:  "#3f7d4e",
  block:  "#b3382c",
  review: "#b87a14",
  error:  "#756a59",
};

const DECISION_FG: Record<string, string> = {
  allow:  "#3f7d4e",
  block:  "#b3382c",
  review: "#b87a14",
  error:  "#756a59",
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
    return <CardSkeleton lines={8} hasHeader={true} />;
  }
  if (error) {
    return <Card className="text-danger">{error.message}</Card>;
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch size={20} />}
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
                  background: DECISION_BG[n.decision] ?? DECISION_BG.error,
                  color: DECISION_FG[n.decision] ?? DECISION_FG.error,
                }}
              >
                {n.decision}
              </span>
            </div>
          </div>
        ),
      },
      style: {
        background: "#ffffff",
        color: "#1c1714",
        border: `1.5px solid ${DECISION_BORDER[n.decision] ?? DECISION_BORDER.error}`,
        borderRadius: 10,
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
      style: { stroke: "#b9ab94" },
    }));

  return (
    <div>
      <PageHeader
        eyebrow="Lineage"
        title="Execution Tree"
        description={`Root: ${rootTaskId}`}
        trailing={loading && data ? <Loader2 size={16} className="text-accent animate-spin" /> : undefined}
      />
      <Card className="p-0 overflow-hidden" style={{ height: 500 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} color="#efe9da" />
          <Controls />
        </ReactFlow>
      </Card>
      <div className="mt-3 flex gap-4 text-[11.5px] text-muted-foreground">
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
