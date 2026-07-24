"use client";

import { useEffect, useMemo, useState } from "react";

type CallbackState = "loading" | "error";

export default function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>("loading");
  const [message, setMessage] = useState("Completing your sign-in...");

  const fallbackLang = useMemo(() => {
    if (typeof document === "undefined") {
      return "en";
    }

    const match = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("treeschool_lang="));

    return match?.split("=")[1] ?? "en";
  }, []);

  useEffect(() => {
    async function completeAuth() {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const expiresIn = params.get("expires_in");

      if (!accessToken || !refreshToken) {
        setState("error");
        setMessage("Missing auth tokens from Supabase confirmation.");
        return;
      }

      const response = await fetch("/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: expiresIn ? Number(expiresIn) : undefined
        })
      });

      if (!response.ok) {
        setState("error");
        setMessage("Could not finish sign-in. Please try signing in manually.");
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : `/p/dashboard?lang=${fallbackLang}`;

      window.location.replace(safeNext);
    }

    void completeAuth();
  }, [fallbackLang]);

  return (
    <main className="min-h-screen bg-[#f8f1e4] px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl rounded-[32px] bg-[#fffaf2] px-6 py-10 text-center sm:px-8">
        <p className="text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">
          {state === "loading" ? "Finishing setup" : "Sign-in issue"}
        </p>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-[1.75] text-ink/76 sm:text-[21px]">
          {message}
        </p>
      </div>
    </main>
  );
}
