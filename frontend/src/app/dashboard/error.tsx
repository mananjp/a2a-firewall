"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react";

/**
 * Route-level error boundary for the dashboard segment.
 *
 * Without this, any render-time throw in a dashboard page unmounts the entire
 * tree — including the sidebar — and Next.js replaces the whole app with the
 * generic "reload / go back" screen. This keeps the failure scoped and legible.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render error:", error);
  }, [error]);

  const router = useRouter();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="material-soft max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center gap-2 text-block">
          <ShieldAlert className="w-5 h-5" />
          <span className="font-mono text-sm font-bold uppercase tracking-wider">
            This view failed to render
          </span>
        </div>

        <p className="text-xs text-ink-muted leading-relaxed">
          The dashboard hit an unexpected error while rendering. This is a bug in
          the app, not a problem with your session — the rest of the console is
          still usable.
        </p>

        <div className="p-3 rounded-lg border border-hairline bg-surface-elevated/60 text-[11px] font-mono text-ink-muted space-y-1">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-warning" />
            <span className="break-words">{error.message || "Unknown error"}</span>
          </div>
          {error.digest && <div className="text-[10px]">Digest: {error.digest}</div>}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/dashboard")}
          >
            Back to overview
          </Button>
        </div>
      </Card>
    </div>
  );
}
