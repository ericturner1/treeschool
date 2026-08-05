"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FieldHelp } from "./field-help";

type ExistingStepPath = {
  id: string;
  routePath: string | null;
};

type Availability = "empty" | "checking" | "available" | "unavailable" | "error";

function editablePath(value: string) {
  return value
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+/, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/-{2,}/g, "-")
    .replace(/\/-+/g, "/")
    .replace(/-+\//g, "/")
    .slice(0, 239);
}

function comparablePath(value: string) {
  return editablePath(value).replace(/[-/]+$/g, "");
}

export function FunnelStepUrlField({
  defaultValue,
  currentStepId,
  existingSteps,
  inputClassName
}: {
  funnelSlug: string;
  defaultValue: string;
  currentStepId?: string;
  existingSteps: ExistingStepPath[];
  inputClassName: string;
}) {
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [origin, setOrigin] = useState("https://www.treehomeschool.com");
  const [path, setPath] = useState(editablePath(defaultValue));
  const [availability, setAvailability] = useState<Availability>(path ? "checking" : "empty");
  const [reason, setReason] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const normalizedPath = comparablePath(path);
  const sitePath = normalizedPath ? `/${normalizedPath}` : "";
  const localConflict = useMemo(
    () => existingSteps.some((step) =>
      step.id !== currentStepId &&
      Boolean(step.routePath) &&
      comparablePath(step.routePath ?? "") === normalizedPath
    ),
    [currentStepId, existingSteps, normalizedPath]
  );
  const publicUrl = `${origin}/${normalizedPath}`;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const nextPath = editablePath(defaultValue);
    setPath(nextPath);
    setAvailability(nextPath ? "checking" : "empty");
    setReason(null);
  }, [currentStepId, defaultValue]);

  useEffect(() => {
    if (!normalizedPath) {
      setAvailability("empty");
      setReason(null);
      return;
    }
    if (localConflict) {
      setAvailability("unavailable");
      setReason("That address is already used by another funnel page.");
      return;
    }

    const controller = new AbortController();
    setAvailability("checking");
    setReason(null);
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ path: sitePath });
        if (currentStepId) query.set("excludeStepId", currentStepId);
        const response = await fetch(`/api/funnels/path-availability?${query}`, {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = await response.json() as {
          available?: boolean;
          reason?: string | null;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Could not check this address.");
        setAvailability(payload.available ? "available" : "unavailable");
        setReason(payload.reason ?? null);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAvailability("error");
        setReason(error instanceof Error ? error.message : "Could not check this address.");
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentStepId, localConflict, normalizedPath, sitePath]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setCustomValidity(
      availability === "unavailable"
        ? reason || "That URL path is unavailable."
        : availability === "checking"
          ? "Please wait while Treeschool checks this URL path."
          : availability === "error"
            ? reason || "Treeschool could not verify this URL path."
            : ""
    );
  }, [availability, reason]);

  async function copyUrl() {
    if (!normalizedPath || availability !== "available") return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      inputRef.current?.focus();
    }
  }

  const statusText = availability === "empty"
    ? "Enter the public address for this funnel page."
    : availability === "checking"
      ? "Checking availability…"
      : availability === "available"
        ? "Available"
        : reason || "That address is unavailable.";

  return (
    <div className="grid gap-2 text-sm font-semibold text-ink/82 sm:col-span-2">
      <label htmlFor={inputId}>
        <FieldHelp
          label="URL path"
          help="The public address for this page. It can be a short root-level path or a nested path, such as first-grade-curriculum or courses/japanese. Treeschool protects existing app pages and checks every funnel URL site-wide."
        />
      </label>
      <span className={`grid min-w-0 overflow-hidden rounded-[14px] border bg-white shadow-[inset_0_1px_1px_rgba(79,53,36,0.04)] transition focus-within:ring-4 ${
        availability === "unavailable" || availability === "error"
          ? "border-[#c76554] focus-within:border-[#b34e3e] focus-within:ring-[#b34e3e]/12"
          : "border-[#d8c5a8] hover:border-[#b79570] focus-within:border-[#739655] focus-within:ring-[#739655]/15"
      } sm:grid-cols-[minmax(230px,auto)_minmax(180px,1fr)_52px]`}>
        <span className="flex min-h-12 min-w-0 items-center overflow-hidden border-b border-[#ded5c7] bg-[#f1f3f5] px-4 py-3 font-medium text-ink/48 sm:border-b-0 sm:border-r">
          <span className="truncate">{origin}/</span>
        </span>
        <input
          id={inputId}
          ref={inputRef}
          name="routePath"
          required
          pattern="[a-z0-9]+(?:[-/][a-z0-9]+)*"
          maxLength={239}
          value={path}
          onChange={(event) => setPath(editablePath(event.target.value))}
          onBlur={() => setPath(normalizedPath)}
          placeholder="first-grade-curriculum"
          aria-describedby={statusId}
          className={`${inputClassName} min-w-0 rounded-none border-0 shadow-none focus:ring-0`}
        />
        <button
          type="button"
          onClick={copyUrl}
          disabled={!normalizedPath || availability !== "available"}
          title={copied ? "Copied" : "Copy URL"}
          aria-label={copied ? "URL copied" : "Copy URL"}
          className="grid min-h-12 place-items-center border-t border-[#ded5c7] bg-white text-earth transition hover:bg-[#f7f0e5] disabled:cursor-not-allowed disabled:opacity-35 sm:border-l sm:border-t-0"
        >
          {copied ? (
            <span className="text-lg font-black text-[#567b40]" aria-hidden="true">✓</span>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
              <path d="M9.5 14.5 14.5 9M7.2 16.8l-1.1 1.1a3.4 3.4 0 0 0 4.8 4.8l3.7-3.7a3.4 3.4 0 0 0 0-4.8M16.8 7.2l1.1-1.1a3.4 3.4 0 1 0-4.8-4.8L9.4 5a3.4 3.4 0 0 0 0 4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          )}
        </button>
      </span>
      <span
        id={statusId}
        className={`min-h-5 text-xs font-semibold ${
          availability === "unavailable" || availability === "error"
            ? "text-[#a34435]"
            : availability === "available"
              ? "text-[#567b40]"
              : "text-ink/45"
        }`}
      >
        {statusText}
      </span>
    </div>
  );
}
