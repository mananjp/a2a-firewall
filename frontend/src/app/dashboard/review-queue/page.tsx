"use client";

import { useState } from "react";
import { useSoc } from "@/components/soc/store";
import { Bar, Btn, PageHead, Panel, Stat, StatGrid, Tag } from "@/components/soc/ui";

export default function ReviewQueuePage() {
  const { queue, decideQueue } = useSoc();
  const [tab, setTab] = useState<"pending" | "approved" | "denied">("pending");
  const rows = queue.filter((q) => q.status === tab);

  return (
    <div className="space-y-8">
      <PageHead
        index="/05"
        title="Review Queue"
        subtitle="Requests escalated by L5 for human adjudication. Nothing proceeds until a decision is recorded."
      />

      <StatGrid>
        <Stat label="Pending" value={String(queue.filter((q) => q.status === "pending").length)} />
        <Stat label="Approved" value={String(queue.filter((q) => q.status === "approved").length)} />
        <Stat label="Denied" value={String(queue.filter((q) => q.status === "denied").length)} />
        <Stat label="SLA" value="< 5 min" note="median decision time" />
      </StatGrid>

      <div className="flex flex-wrap gap-2">
        {(["pending", "approved", "denied"] as const).map((t) => (
          <Btn key={t} variant={tab === t ? "solid" : "outline"} onClick={() => setTab(t)}>
            {t} ({queue.filter((q) => q.status === t).length})
          </Btn>
        ))}
      </div>

      <Panel title={`${tab} items`} hint={`${rows.length} records`}>
        <div className="divide-y divide-ink/10">
          {rows.map((q) => (
            <div key={q.id} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_200px_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>{q.id}</span>
                  <span>{q.raised}</span>
                  <Tag tone={q.risk > 60 ? "danger" : "violet"}>risk {q.risk}%</Tag>
                </div>
                <div className="mt-1 font-display text-sm font-bold uppercase">{q.agent}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {q.intent} — {q.reason}
                </div>
              </div>
              <Bar value={q.risk} tone={q.risk > 60 ? "danger" : "violet"} />
              {q.status === "pending" ? (
                <div className="flex gap-2">
                  <Btn variant="lime" onClick={() => decideQueue(q.id, "approved")}>
                    Approve
                  </Btn>
                  <Btn variant="danger" onClick={() => decideQueue(q.id, "denied")}>
                    Deny
                  </Btn>
                </div>
              ) : (
                <Tag tone={q.status === "approved" ? "lime" : "danger"}>{q.status}</Tag>
              )}
            </div>
          ))}
          {!rows.length && <p className="py-6 font-mono text-xs text-muted-foreground">// queue empty</p>}
        </div>
      </Panel>
    </div>
  );
}
