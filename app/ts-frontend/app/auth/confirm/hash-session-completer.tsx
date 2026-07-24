"use client";

import { useEffect, useState } from "react";

export function HashSessionCompleter({
  next,
  emailChange = false
}: {
  next: string;
  emailChange?: boolean;
}) {
  const [status, setStatus] = useState<"checking" | "saving" | "error">("checking");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    const finishEmailChangeWith = (key: "confirmed" | "error", value: string) => {
      const resultUrl = new URL(window.location.href);
      resultUrl.hash = "";
      resultUrl.searchParams.set(key, value);
      window.location.replace(resultUrl.toString());
    };

    if (!accessToken || !refreshToken) {
      if (emailChange) {
        const error = params.get("error_description") ?? params.get("error");
        finishEmailChangeWith(
          error ? "error" : params.get("message") ? "confirmed" : "error",
          error ?? (params.get("message") ? "1" : "This email-change link is incomplete.")
        );
      } else {
        setStatus("error");
      }
      return;
    }

    setStatus("saving");
    void fetch("/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Number(params.get("expires_in") || 3600)
      })
    })
      .then((response) => {
        if (response.ok) {
          window.location.replace(next);
        } else if (emailChange) {
          finishEmailChangeWith("error", "Could not finish the email change. Please request a new link.");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (emailChange) {
          finishEmailChangeWith("error", "Could not finish the email change. Please try again.");
        } else {
          setStatus("error");
        }
      });
  }, [emailChange, next]);

  if (emailChange) return null;

  return status === "error" ? (
    <p role="alert" className="mt-5 text-sm font-semibold leading-6 text-[#8b3e2f]">
      This sign-in link is incomplete or has expired. Return to the sign-in page to request a new one.
    </p>
  ) : (
    <div role="status" className="mt-6 flex items-center justify-center gap-3 text-sm font-semibold text-[#4d6a39]">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent" />
      {status === "saving" ? "Signing you in…" : "Checking your secure link…"}
    </div>
  );
}
