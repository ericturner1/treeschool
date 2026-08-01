"use client";

import { useState } from "react";
import type { ManagedFunnelAttribution } from "../lib/funnels/server";

export function ManagedFunnelLeadForm({
  attribution,
  heading,
  collectFirstName,
  firstNameLabel,
  emailLabel,
  submitLabel,
  destination,
  className
}: {
  attribution: ManagedFunnelAttribution;
  heading: string;
  collectFirstName: boolean;
  firstNameLabel: string;
  emailLabel: string;
  submitLabel: string;
  destination: string;
  className: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    const search = new URLSearchParams(window.location.search);
    const response = await fetch("/api/funnels/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...attribution,
        eventId: crypto.randomUUID(),
        firstName: String(formData.get("firstName") ?? "").trim() || null,
        email: String(formData.get("email") ?? "").trim(),
        attribution: {
          referrer: document.referrer || null,
          utmSource: search.get("utm_source"),
          utmMedium: search.get("utm_medium"),
          utmCampaign: search.get("utm_campaign"),
          utmContent: search.get("utm_content"),
          utmTerm: search.get("utm_term")
        }
      })
    }).catch(() => null);
    if (!response?.ok) {
      const payload = await response?.json().catch(() => null) as { error?: string } | null;
      setError(payload?.error || "We couldn’t save your details. Please try again.");
      setPending(false);
      return;
    }
    window.location.assign(destination);
  }

  return (
    <form
      action={submit}
      className="mt-9 max-w-2xl rounded-[22px] border border-ink/10 bg-white/70 p-5"
    >
      <p className="text-lg font-semibold">{heading}</p>
      <div className={`mt-4 grid gap-3 ${collectFirstName ? "sm:grid-cols-2" : ""}`}>
        {collectFirstName ? (
          <label className="grid gap-1.5 text-sm font-semibold">
            {firstNameLabel}
            <input name="firstName" autoComplete="given-name" className="ts-input bg-white" />
          </label>
        ) : null}
        <label className="grid gap-1.5 text-sm font-semibold">
          {emailLabel}
          <input name="email" type="email" required autoComplete="email" className="ts-input bg-white" />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-[#984838]" role="alert">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className={`mt-4 inline-flex min-h-14 items-center justify-center rounded-[18px] border-2 px-7 py-4 text-lg font-semibold transition disabled:cursor-wait disabled:opacity-65 ${className}`}
      >
        {pending ? "Saving…" : submitLabel}
        {!pending ? <span className="ml-2" aria-hidden="true">→</span> : null}
      </button>
    </form>
  );
}
