"use client";

import { useFormStatus } from "react-dom";
import { unlockPointAwardSound } from "../../../../../lib/audio/point-award-sound";

export function PointsSubmitButton({
  idleLabel,
  pendingLabel,
  disabled = false,
  tone = "light",
  prepareAwardSound = false,
  requireExplicitActivation = false
}: {
  idleLabel: string;
  pendingLabel: string;
  disabled?: boolean;
  tone?: "light" | "dark" | "outline";
  prepareAwardSound?: boolean;
  requireExplicitActivation?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-explicit-points-submit={requireExplicitActivation ? "true" : undefined}
      disabled={disabled || pending}
      data-click-sound={prepareAwardSound ? "none" : undefined}
      onPointerDown={prepareAwardSound ? () => void unlockPointAwardSound() : undefined}
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
