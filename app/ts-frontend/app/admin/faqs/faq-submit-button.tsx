"use client";

import { useFormStatus } from "react-dom";

export function FaqSubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cta-button cta-button--light cta-button--small disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
