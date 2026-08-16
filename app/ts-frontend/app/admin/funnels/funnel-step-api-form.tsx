"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";

type ApiFormState = {
  pending: boolean;
  saved: boolean;
};

const FunnelStepApiFormContext = createContext<ApiFormState | null>(null);

export function useFunnelStepApiFormState() {
  return useContext(FunnelStepApiFormContext);
}

export function FunnelStepApiForm({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const successTimer = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (successTimer.current !== null) window.clearTimeout(successTimer.current);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || pending) return;

    if (successTimer.current !== null) window.clearTimeout(successTimer.current);
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/funnels/steps", {
        method: "POST",
        body: new FormData(form),
        headers: { accept: "application/json" }
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save the funnel step.");
      setSaved(true);
      // The form saves through the API, while the selected-step heading and
      // journey rail are rendered by the surrounding server component. Pull
      // their fresh props in place so a renamed step is reflected everywhere
      // without navigating away or performing a full browser reload.
      router.refresh();
      successTimer.current = window.setTimeout(() => setSaved(false), 2400);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the funnel step.");
    } finally {
      setPending(false);
    }
  }

  return (
    <FunnelStepApiFormContext.Provider value={{ pending, saved }}>
      <form
        onSubmit={submit}
        onChangeCapture={() => {
          setSaved(false);
          setError(null);
        }}
        className={className}
      >
        {children}
        {saved || error ? (
          <p
            role={error ? "alert" : "status"}
            aria-live="polite"
            className={`fixed left-1/2 top-5 z-[100] -translate-x-1/2 rounded-[14px] border px-5 py-3 text-sm font-semibold shadow-[0_14px_40px_rgba(49,35,24,.18)] ${
              error
                ? "border-[#e0ac9f] bg-[#fff0eb] text-[#8c4536]"
                : "border-[#b9cfa5] bg-[#eef5e7] text-[#4f6f3c]"
            }`}
          >
            {error ?? "Saved without reloading the page."}
          </p>
        ) : null}
      </form>
    </FunnelStepApiFormContext.Provider>
  );
}
