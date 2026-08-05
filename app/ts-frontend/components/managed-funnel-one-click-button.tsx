"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export function ManagedFunnelOneClickButton({
  label,
  stepId,
  sourceCheckoutSessionId,
  className,
  style,
  children
}: {
  label: string;
  stepId: string;
  sourceCheckoutSessionId: string | null;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptOffer() {
    if (!sourceCheckoutSessionId) {
      setError("Complete the previous checkout before accepting this offer.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/funnels/one-click-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCheckoutSessionId,
          funnelStepId: stepId,
          currentPath: `${window.location.pathname}${window.location.search}`
        })
      });
      const payload = await response.json().catch(() => null) as {
        status?: "complete" | "redirect";
        nextPath?: string;
        url?: string | null;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not add this offer.");
      const destination = payload?.status === "complete" ? payload.nextPath : payload?.url;
      if (!destination) throw new Error("The next checkout step is unavailable.");
      window.location.assign(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add this offer.");
      setPending(false);
    }
  }

  return (
    <div className="grid justify-items-center gap-3">
      <button
        type="button"
        onClick={acceptOffer}
        disabled={pending}
        aria-label={label}
        data-funnel-cta="primary"
        data-funnel-target="one-click-offer"
        className={`${className} disabled:cursor-wait disabled:opacity-70`}
        style={style}
      >
        {pending ? <span className="inline-flex items-center gap-2"><span className="activity-spinner" aria-hidden="true" />Adding…</span> : children}
      </button>
      {error ? <p role="alert" className="max-w-md text-center text-sm font-semibold text-[#9b4636]">{error}</p> : null}
    </div>
  );
}
