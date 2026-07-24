"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh({ enabled, intervalMs = 6000 }: { enabled: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const handle = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(handle);
  }, [enabled, intervalMs, router]);

  return null;
}
