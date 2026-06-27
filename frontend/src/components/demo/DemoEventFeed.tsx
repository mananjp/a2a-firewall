import { useEffect, useRef } from "react";

/**
 * SOC-style scrolling event feed with timestamps.
 * Events slide in from the top with a fade animation.
 */

export interface DemoEvent {
  id: string;
  time: string;
  label: string;
  type: "info" | "warning" | "danger" | "success";
}

interface Props {
  events: DemoEvent[];
}

const TYPE_STYLES: Record<DemoEvent["type"], { dot: string; text: string }> = {
  info: { dot: "bg-blue-400", text: "text-blue-300" },
  warning: { dot: "bg-amber-400", text: "text-amber-300" },
  danger: { dot: "bg-red-400", text: "text-red-300" },
  success: { dot: "bg-emerald-400", text: "text-emerald-300" },
};

export default function DemoEventFeed({ events }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="card flex flex-col">
      <div className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {events.length > 0 && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${events.length > 0 ? "bg-emerald-500" : "bg-slate-600"}`}
          />
        </span>
        Live Event Feed
      </div>

      <div
        ref={scrollRef}
        className="flex-1 max-h-[320px] overflow-y-auto space-y-1 scrollbar-thin pr-1"
      >
        {events.length === 0 && (
          <p className="text-xs text-slate-600 italic py-4 text-center">
            Waiting for demo to start…
          </p>
        )}
        {events.map((ev, i) => {
          const style = TYPE_STYLES[ev.type];
          return (
            <div
              key={ev.id}
              className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-slate-800/50 transition-colors"
              style={{
                animation: `feedSlideIn 0.3s ease-out ${i * 0.05}s both`,
              }}
            >
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
              <span className="text-[10px] font-mono text-slate-600 shrink-0 w-[52px]">
                {ev.time}
              </span>
              <span className={`text-xs font-mono ${style.text}`}>{ev.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
