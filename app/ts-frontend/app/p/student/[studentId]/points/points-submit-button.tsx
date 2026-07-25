"use client";

import { useFormStatus } from "react-dom";

export function PointsSubmitButton({
  idleLabel,
  pendingLabel,
  disabled = false,
  tone = "light"
}: {
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
  tone?: "light" | "dark" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`cta-button cta-button--small ${
        tone === "dark"
          ? "cta-button--dark"
          : tone === "outline"
            ? "cta-button--outline"
            : "cta-button--light"
      } disabled:cursor-wait disabled:opacity-55`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
