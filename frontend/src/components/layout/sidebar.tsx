"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ShieldAlert,
  Bot,
  FileText,
  MessageSquare,
  FlaskConical,
  Flame,
  Activity,
  KeyRound,
  Settings2,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useApiKey } from "@/hooks/use-api-key";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/simulation", label: "Simulation", icon: FlaskConical },
  { href: "/dashboard/demo", label: "Live Demo", icon: Flame },
  { href: "/dashboard/violations", label: "Violations", icon: ShieldAlert },
  { href: "/dashboard/telemetry", label: "Telemetry", icon: Activity },
  { href: "/dashboard/identity", label: "Identity", icon: KeyRound },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/policies", label: "Policies", icon: FileText },
  { href: "/dashboard/review", label: "Review Queue", icon: MessageSquare },
  { href: "/dashboard/workspace", label: "Workspace", icon: Settings2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { clear } = useApiKey();
  const router = useRouter();

  function handleLogout() {
    clear();
    router.push("/login");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[220px] flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
          <ShieldAlert size={15} strokeWidth={2.2} />
        </div>
        <span className="text-sm font-semibold tracking-tight">A2A Firewall</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={active ? 2 : 1.5}
                    className={clsx(
                      "shrink-0 transition-colors",
                      active ? "text-accent" : "text-muted group-hover:text-foreground"
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {active && (
                    <ChevronRight
                      size={12}
                      className="text-accent/50"
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
        >
          <LogOut size={16} strokeWidth={1.5} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
