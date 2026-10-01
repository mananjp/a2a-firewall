"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-bg-base text-ink-primary">
      <Sidebar />
      <main className="md:ml-[240px] min-h-screen min-w-0">
        <div className="mx-auto max-w-[1340px] px-4 sm:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
