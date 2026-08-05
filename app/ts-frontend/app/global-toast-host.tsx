"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  GLOBAL_TOAST_EVENT,
  type GlobalToastDetail
} from "../lib/toast";

type ToastKind = "success" | "error";

type ToastItem = {
  id: number;
  kind: ToastKind;
  text: string;
  actionHref?: string;
  actionLabel?: string;
};

const TOAST_DURATION_MS = 4200;

export function GlobalToastHost() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const handledKeyRef = useRef<string | null>(null);

  const incomingToasts = useMemo(() => {
    const next: Array<Omit<ToastItem, "id">> = [];
    const message = searchParams.get("message");
    const error = searchParams.get("error");
    const published = searchParams.get("published");

    if (message) {
      next.push({
        kind: "success",
        text: message,
        ...(published
          ? {
              actionHref: `/blog/${encodeURIComponent(published)}`,
              actionLabel: "View post"
            }
          : {})
      });
    }

    if (error) {
      next.push({ kind: "error", text: error });
    }

    if (pathname === "/p/billing" && searchParams.get("checkout") === "success") {
      next.push({
        kind: "success",
        text: "Stripe checkout completed. Your access will update as soon as Stripe confirms the subscription."
      });
    }

    if (pathname === "/p/billing" && searchParams.get("planChanged") === "1") {
      next.push({
        kind: "success",
        text: "Your plan change was confirmed. Student capacity will update as soon as Stripe sends its confirmation."
      });
    }

    if (pathname === "/p/dashboard" && searchParams.get("student_checkout") === "success") {
      next.push({
        kind: "success",
        text: "Payment received. The additional student will appear as soon as Stripe confirms it."
      });
    }

    return next;
  }, [pathname, searchParams]);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<GlobalToastDetail>).detail;
      const text = detail?.text?.trim();
      if (!text) return;
      setToasts((current) => [
        ...current,
        {
          id: Date.now(),
          kind: detail.kind === "error" ? "error" : "success",
          text,
          ...(detail.actionHref
            ? {
                actionHref: detail.actionHref,
                ...(detail.actionLabel ? { actionLabel: detail.actionLabel } : {})
              }
            : {})
        }
      ]);
    }

    window.addEventListener(GLOBAL_TOAST_EVENT, onToast);
    return () => window.removeEventListener(GLOBAL_TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (incomingToasts.length === 0) {
      handledKeyRef.current = null;
      return;
    }

    const nextKey = `${pathname}?${searchParams.toString()}`;
    if (handledKeyRef.current === nextKey) {
      return;
    }

    handledKeyRef.current = nextKey;

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
    nextSearchParams.delete("published");
    if (pathname === "/p/billing") {
      nextSearchParams.delete("checkout");
      nextSearchParams.delete("planChanged");
    }
    if (pathname === "/p/dashboard") {
      nextSearchParams.delete("student_checkout");
    }
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
    <div className="pointer-events-none fixed right-4 top-4 z-[300] flex w-[min(92vw,420px)] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-card ${toast.kind === "error" ? "toast-card--error" : "toast-card--success"}`}
          role="status"
          aria-live="polite"
        >
          <div className="pr-8">
            <p className="text-sm font-semibold leading-[1.6]">{toast.text}</p>
            {toast.actionHref ? (
              <a
                href={toast.actionHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-bold underline decoration-current/35 underline-offset-4 hover:decoration-current"
              >
                {toast.actionLabel ?? "Open"} <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>
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
