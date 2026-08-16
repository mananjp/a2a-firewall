"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base text-ink-primary">
      <Sidebar />
      <main className="ml-[240px] min-h-screen">
        <div className="mx-auto max-w-[1340px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
