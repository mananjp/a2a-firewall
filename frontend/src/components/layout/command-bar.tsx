"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  ShieldAlert,
  Bot,
  FileText,
  MessageSquare,
  FlaskConical,
  Flame,
  Activity,
  KeyRound,
  GitFork,
  Settings2,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Action" | "Inspection";
  icon: typeof LayoutDashboard;
  href?: string;
  action?: () => void;
  shortcut?: string;
}

export function CommandBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const items: CommandItem[] = [
    { id: "dash", title: "Overview Dashboard", category: "Navigation", icon: LayoutDashboard, href: "/dashboard" },
    { id: "audit", title: "Delegation Chain Audit", category: "Navigation", icon: GitFork, href: "/dashboard/audit" },
    { id: "telemetry", title: "Live Inspector & Telemetry", category: "Navigation", icon: Activity, href: "/dashboard/telemetry" },
    { id: "review", title: "Human Review Queue", category: "Navigation", icon: MessageSquare, href: "/dashboard/review" },
    { id: "violations", title: "Security Violations", category: "Navigation", icon: ShieldAlert, href: "/dashboard/violations" },
    { id: "identity", title: "Agent Identities & Ed25519 Keys", category: "Navigation", icon: KeyRound, href: "/dashboard/identity" },
    { id: "agents", title: "Agent Registry & Matrix", category: "Navigation", icon: Bot, href: "/dashboard/agents" },
    { id: "policies", title: "Firewall Policies & Rules", category: "Navigation", icon: FileText, href: "/dashboard/policies" },
    { id: "simulation", title: "Multi-Agent Simulation", category: "Navigation", icon: FlaskConical, href: "/dashboard/simulation" },
    { id: "demo", title: "Live Attack Demo", category: "Navigation", icon: Flame, href: "/dashboard/demo" },
    { id: "workspace", title: "Workspace Settings", category: "Navigation", icon: Settings2, href: "/dashboard/workspace" },
  ];

  const filtered = items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (item: CommandItem) => {
    setIsOpen(false);
    setQuery("");
    if (item.href) {
      router.push(item.href);
    } else if (item.action) {
      item.action();
    }
  };

  return (
    <>
      {/* Trigger button for header */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface border border-hairline hover:border-hairline-strong text-ink-muted hover:text-ink-primary transition-all text-[12px] font-medium"
      >
        <Search size={13} />
        <span className="hidden sm:inline">Jump to task, agent, trace...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-sunken border border-hairline font-mono text-[10px] text-ink-muted">
          ⌘K
        </kbd>
      </button>

      {/* Modal Dialog */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Dialog panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.16 }}
              className="relative w-full max-w-lg rounded-xl border border-hairline-strong bg-surface shadow-popover overflow-hidden z-10"
            >
              <div className="flex items-center px-4 border-b border-hairline">
                <Search size={16} className="text-ink-muted shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search routes, agents, tasks, or trace IDs..."
                  className="w-full bg-transparent px-3 py-3.5 text-[14px] text-ink-primary placeholder:text-ink-muted focus:outline-none"
                />
                <kbd className="px-1.5 py-0.5 rounded bg-surface-elevated border border-hairline font-mono text-[10px] text-ink-muted">
                  ESC
                </kbd>
              </div>

              <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                {filtered.length > 0 ? (
                  filtered.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left text-[13px] text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={15} className="text-accent" />
                          <span className="font-medium text-ink-primary">{item.title}</span>
                        </div>
                        <span className="text-[11px] font-mono text-ink-muted">{item.category}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-[12px] text-ink-muted">
                    No matching destinations found.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
