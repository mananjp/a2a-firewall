"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/site/Chrome";
import { useSoc } from "@/components/soc/store";
import { clearApiKey } from "@/lib/api";

const NAV: { href: string; label: string; group: string }[] = [
  { href: "/dashboard", label: "Overview", group: "Operations" },
  { href: "/dashboard/telemetry", label: "Live Inspector", group: "Operations" },
  { href: "/dashboard/audit", label: "Delegation Audit", group: "Operations" },
  { href: "/dashboard/delegation-demo", label: "Delegation Demo", group: "Operations" },
  { href: "/dashboard/review", label: "Review Queue", group: "Governance" },
  { href: "/dashboard/violations", label: "Violations", group: "Governance" },
  { href: "/dashboard/simulation", label: "Simulation", group: "Labs" },
  { href: "/dashboard/demo", label: "Live Attack Demo", group: "Labs" },
  { href: "/dashboard/identity", label: "Identity & Keys", group: "Control" },
  { href: "/dashboard/agents", label: "Agent Registry", group: "Control" },
  { href: "/dashboard/policies", label: "Firewall Policies", group: "Control" },
  { href: "/dashboard/workspace", label: "Workspace", group: "Control" },
];


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [time, setTime] = useState("--:--:--");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, isConnected, lastSyncedAt } = useSoc();

  useEffect(() => {
    const tick = () => setTime(new Date().toISOString().slice(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleSignOut = () => {
    clearApiKey();
    router.push("/login");
  };

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-ink bg-paper/90 px-4 py-3 backdrop-blur lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          <span className="hidden border-l border-ink/20 pl-4 label-mono text-muted-foreground sm:block">
            SOC / {workspace.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden border border-ink/20 px-3 py-1.5 font-mono text-[10px] leading-tight text-muted-foreground md:block">
            <div>SYS.TIME</div>
            <div className="text-ink">{time}</div>
          </div>
          {isConnected ? (
            <span className="hidden items-center gap-1.5 border border-ink bg-lime px-3 py-2 label-mono text-lime-foreground sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-black animate-pulse" />
              LIVE BACKEND
            </span>
          ) : (
            <span className="hidden items-center gap-1.5 border border-ink bg-amber-500/20 px-3 py-2 label-mono text-amber-900 dark:text-amber-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              CONNECTING...
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="border border-ink px-4 py-2 label-mono hover:bg-secondary"
          >
            Sign out
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="border border-ink px-3 py-2 label-mono lg:hidden"
            aria-label="Toggle navigation"
          >
            Menu
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className={`${
            open ? "block" : "hidden"
          } border-b border-ink/20 lg:sticky lg:top-[61px] lg:block lg:h-[calc(100vh-61px)] lg:overflow-y-auto lg:border-b-0 lg:border-r`}
        >
          {groups.map((g) => (
            <div key={g} className="border-b border-ink/15 py-3">
              <div className="px-4 pb-2 label-mono text-muted-foreground">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => {
                const isActive =
                  n.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname === n.href || pathname?.startsWith(`${n.href}/`);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-2 font-mono text-xs transition-colors hover:bg-secondary ${
                      isActive ? "bg-violet text-violet-foreground" : ""
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
          {lastSyncedAt && (
            <div className="p-4 font-mono text-[10px] text-muted-foreground">
              Synced: {lastSyncedAt}
            </div>
          )}
        </aside>

        <main className="min-w-0 px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
