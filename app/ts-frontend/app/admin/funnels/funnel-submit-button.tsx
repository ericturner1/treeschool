"use client";

import { useFormStatus } from "react-dom";
import { useFunnelStepApiFormState } from "./funnel-step-api-form";

export function FunnelSubmitButton({
  label,
  pendingLabel,
  tone = "primary",
  confirmMessage,
  disabled = false,
  className = ""
}: {
  label: string;
  pendingLabel?: string;
  tone?: "primary" | "outline" | "danger";
  confirmMessage?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { pending: actionPending } = useFormStatus();
  const apiForm = useFunnelStepApiFormState();
  const pending = actionPending || Boolean(apiForm?.pending);
  const displayedLabel = apiForm?.saved ? "Saved" : label;
  const classes = tone === "primary"
    ? "cta-button cta-button--light"
    : tone === "danger"
      ? "rounded-[14px] border border-[#dfaa9d] bg-[#fff3ef] px-4 py-3 text-sm font-semibold text-[#8c4536] transition hover:bg-[#fde8e0]"
      : "cta-button cta-button--outline";

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className={`${classes} ${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="ts-spinner h-4 w-4" aria-hidden="true" />
          {pendingLabel ?? "Saving…"}
        </span>
      ) : displayedLabel}
    </button>
  );
}
