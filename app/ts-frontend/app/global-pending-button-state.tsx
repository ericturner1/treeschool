"use client";

import { useEffect } from "react";

function applyLoadingState(element: HTMLElement) {
  if (element.classList.contains("is-loading")) {
    return;
  }

  element.classList.add("is-loading");
  element.setAttribute("aria-busy", "true");

  window.setTimeout(() => {
    element.classList.remove("is-loading");
    element.removeAttribute("aria-busy");
  }, 8000);
}

export function GlobalPendingButtonState() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const clickable = target.closest('a.cta-button, a[role="button"]') as HTMLElement | null;
      if (!clickable) {
        return;
      }

      if (clickable.getAttribute("aria-disabled") === "true") {
        return;
      }

      applyLoadingState(clickable);
    }

    function handleSubmit(event: SubmitEvent) {
      const submitter = event.submitter;
      if (!(submitter instanceof HTMLElement)) {
        return;
      }

      if (
        !(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) ||
        submitter.disabled
      ) {
        return;
      }

      applyLoadingState(submitter);
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  return null;
}
