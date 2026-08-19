"use client";

import { useState, useCallback } from "react";
import { review } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { ReviewItem } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { MessageJourneyPipeline } from "@/components/pipeline/message-journey-pipeline";
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  BrainCircuit,
  KeyRound,
  ArrowRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ReviewQueuePage() {
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const {
    data,
    loading,
    error: loadErr,
    refresh,
  } = usePolling<ReviewItem[]>(
    useCallback((_signal) => review.list() as Promise<ReviewItem[]>, []),
    4000
  );

  async function onDecide(token: string, action: "approve" | "reject") {
    setError(null);
    setActionLoading(token + action);
    try {
      await review.decide(token, action);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review verdict");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          eyebrow="Human-in-the-Loop"
          title="Manual Review Queue"
          description="Messages landing between the review threshold and block threshold. Requires manual triage and operator authorization."
          trailing={loading && data ? <Loader2 size={16} className="text-accent animate-spin" /> : undefined}
        />
        {data && data.length > 0 && (
          <Badge variant="review" className="font-mono text-[12px] px-3 py-1">
            {data.length} {data.length === 1 ? "Item Pending" : "Items Pending"}
          </Badge>
        )}
      </div>

      {(error || loadErr) && (
        <div className="rounded-lg border border-block/30 bg-block/10 px-4 py-3 text-[13px] text-block font-mono">
          {error || loadErr?.message}
        </div>
      )}

      {loading && !data && <TableSkeleton rows={4} cols={3} />}

      {!loading && data && data.length === 0 && (
        <EmptyState
          icon={<CheckCircle2 size={24} className="text-allow" />}
          title="Nothing waiting on you"
          description="All autonomous agent traffic is within automatic thresholds. Messages with ambiguous risk scores will appear here for one-click authorization."
        />
      )}

      {data && data.length > 0 && (
        <div className="space-y-4">
          <AnimatePresence>
            {data.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="material-panel rounded-xl p-5 border-l-4 border-l-review"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-hairline">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <Badge variant="review">Review Hold</Badge>
                      <span className="font-mono text-[13px] font-bold text-ink-primary">
                        Task: {r.task_id}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-ink-muted flex items-center gap-2">
                      <span>Token: {r.review_token.slice(0, 16)}...</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-review">
                        <Clock size={11} /> Expires: {new Date(r.expires_at).toLocaleTimeString([], { timeZone: 'UTC' })} UTC
                      </span>
                    </div>
                  </div>

                  {/* Decision Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={() => onDecide(r.review_token, "approve")}
                      disabled={actionLoading === r.review_token + "approve"}
                      variant="success"
                      size="sm"
                      className="gap-1.5 font-mono text-[12px]"
                    >
                      <CheckCircle2 size={13} />
                      {actionLoading === r.review_token + "approve" ? "Approving..." : "Approve & Deliver"}
                    </Button>
                    <Button
                      onClick={() => onDecide(r.review_token, "reject")}
                      disabled={actionLoading === r.review_token + "reject"}
                      variant="danger"
                      size="sm"
                      className="gap-1.5 font-mono text-[12px]"
                    >
                      <XCircle size={13} />
                      {actionLoading === r.review_token + "reject" ? "Rejecting..." : "Reject & Block"}
                    </Button>
                  </div>
                </div>

                {/* Pipeline Context */}
                <div className="mt-4 pt-2">
                  <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BrainCircuit size={13} className="text-review" />
                    <span>Inspection Pipeline Grey-Zone State</span>
                  </div>
                  <MessageJourneyPipeline
                    decision="review"
                    riskScore={0.58}
                    intentDriftScore={0.62}
                    animated={false}
                    className="bg-surface-sunken p-3"
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
