"use client";

import { useState, useCallback } from "react";
import { review } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { ReviewItem } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare, CheckCircle2, XCircle } from "lucide-react";

export default function ReviewQueuePage() {
  const [error, setError] = useState<string | null>(null);
  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<ReviewItem[]>(
    useCallback((_signal) => review.list() as Promise<ReviewItem[]>, []),
    5000
  );

  async function onDecide(token: string, action: "approve" | "reject") {
    setError(null);
    try {
      await review.decide(token, action);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="Review Queue"
        description="Tasks with ambiguous risk scores that need human decision."
      />

      {(error || loadErr) && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error || loadErr?.message}
        </div>
      )}

      {loading && !data && (
        <Card className="text-sm text-muted">Loading...</Card>
      )}
      {data && data.length === 0 && (
        <EmptyState
          icon={<MessageSquare size={24} />}
          title="No pending reviews"
          description="Tasks with risk between review and block thresholds land here."
        />
      )}
      {data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((r) => (
            <Card key={r.id} className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm">
                  Task{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.task_id}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Token{" "}
                  <span className="font-mono">
                    {r.review_token.slice(0, 12)}...
                  </span>{" "}
                  - expires {new Date(r.expires_at).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button
                  onClick={() => onDecide(r.review_token, "approve")}
                  size="sm"
                  variant="primary"
                >
                  <CheckCircle2 size={13} />
                  Approve
                </Button>
                <Button
                  onClick={() => onDecide(r.review_token, "reject")}
                  size="sm"
                  variant="danger"
                >
                  <XCircle size={13} />
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
