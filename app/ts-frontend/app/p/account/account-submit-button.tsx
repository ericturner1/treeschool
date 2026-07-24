"use client";

import { useFormStatus } from "react-dom";

export function AccountSubmitButton({
  idleLabel,
  pendingLabel,
  fullWidth = false
}: {
  idleLabel: string;
  pendingLabel: string;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`cta-button cta-button--dark disabled:cursor-wait disabled:opacity-55 ${fullWidth ? "w-full" : ""}`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
