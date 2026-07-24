"use client";

import { useFormStatus } from "react-dom";

export function EmailChangeSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cta-button cta-button--dark mt-5 w-full disabled:cursor-wait disabled:opacity-55 sm:w-auto"
    >
      {pending ? "Sending confirmations…" : "Change email address"}
    </button>
  );
}
