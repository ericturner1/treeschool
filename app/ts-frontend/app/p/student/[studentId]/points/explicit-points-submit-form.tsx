"use client";

import { useRef, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

function explicitSubmitButton(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLButtonElement>(
    'button[type="submit"][data-explicit-points-submit="true"]',
  );
}

export function ExplicitPointsSubmitForm({
  action,
  className,
  confirmationValue,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  confirmationValue: string;
  children: ReactNode;
}) {
  const confirmationRef = useRef<HTMLInputElement>(null);
  const explicitlyActivatedRef = useRef(false);

  const setActivation = (active: boolean) => {
    explicitlyActivatedRef.current = active;
    if (confirmationRef.current) {
      confirmationRef.current.value = active ? confirmationValue : "";
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLFormElement>) => {
    // Mobile browsers can synthesize an implicit form submission while focus
    // moves from a numeric keyboard into a native select. Only a pointer-down
    // that began on the real submit button arms this transaction.
    setActivation(Boolean(explicitSubmitButton(event.target)));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const isSubmitKey = event.key === "Enter" || event.key === " ";
    setActivation(isSubmitKey && Boolean(explicitSubmitButton(event.target)));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const explicitlySubmitted =
      explicitlyActivatedRef.current &&
      Boolean(explicitSubmitButton(submitter)) &&
      confirmationRef.current?.value === confirmationValue;

    if (!explicitlySubmitted) {
      event.preventDefault();
      event.stopPropagation();
      setActivation(false);
    }
  };

  return (
    <form
      action={action}
      className={className}
      onPointerDownCapture={handlePointerDown}
      onKeyDownCapture={handleKeyDown}
      onSubmitCapture={handleSubmit}
    >
      <input
        ref={confirmationRef}
        type="hidden"
        name="explicitSubmitIntent"
        defaultValue=""
      />
      {children}
    </form>
  );
}
