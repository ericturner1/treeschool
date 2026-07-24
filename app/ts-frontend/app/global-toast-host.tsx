"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type ToastKind = "success" | "error";

type ToastItem = {
  id: number;
  kind: ToastKind;
  text: string;
};

const TOAST_DURATION_MS = 4200;

export function GlobalToastHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const handledKeysRef = useRef<Set<string>>(new Set());

  const incomingToasts = useMemo(() => {
    const next: Array<Omit<ToastItem, "id">> = [];
    const message = searchParams.get("message");
    const error = searchParams.get("error");

    if (message) {
      next.push({ kind: "success", text: message });
    }

    if (error) {
      next.push({ kind: "error", text: error });
    }

    return next;
  }, [searchParams]);

  useEffect(() => {
    if (incomingToasts.length === 0) {
      return;
    }

    const nextKey = incomingToasts.map((toast) => `${toast.kind}:${toast.text}`).join("|");
    if (handledKeysRef.current.has(nextKey)) {
      return;
    }

    handledKeysRef.current.add(nextKey);

    setToasts((current) => [
      ...current,
      ...incomingToasts.map((toast, index) => ({
        ...toast,
        id: Date.now() + index
      }))
    ]);

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("message");
    nextSearchParams.delete("error");
    const nextQuery = nextSearchParams.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [incomingToasts, pathname, searchParams]);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, TOAST_DURATION_MS)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [toasts]);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(92vw,420px)] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-card ${toast.kind === "error" ? "toast-card--error" : "toast-card--success"}`}
          role="status"
          aria-live="polite"
        >
          <p className="pr-8 text-sm font-semibold leading-[1.6]">{toast.text}</p>
          <button
            type="button"
            aria-label="Dismiss notification"
            className="pointer-events-auto absolute right-3 top-3 rounded-full px-2 py-1 text-sm font-bold text-current/70 transition hover:text-current"
            onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
