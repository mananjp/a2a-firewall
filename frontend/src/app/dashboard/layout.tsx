"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApiKey } from "@/hooks/use-api-key";
import { getSessionToken } from "@/lib/api";
import { Shell } from "@/components/layout/shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { apiKey } = useApiKey();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasAuth = Boolean(apiKey || getSessionToken());

  useEffect(() => {
    if (mounted && !hasAuth) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [mounted, hasAuth, router, pathname]);

  if (!mounted || !hasAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  return <Shell>{children}</Shell>;
}
