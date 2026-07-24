"use client";

import { useEffect, useRef } from "react";

export function GlobalButtonClickSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const clickable = target.closest(
        'button, input[type="button"], input[type="submit"], a.cta-button, a[role="button"]'
      ) as HTMLElement | null;
      if (!clickable) {
        return;
      }

      const disabledClickable =
        clickable instanceof HTMLButtonElement ||
        clickable instanceof HTMLInputElement
          ? clickable.disabled
          : clickable.getAttribute("aria-disabled") === "true";

      if (disabledClickable) {
        return;
      }

      if (clickable.dataset.clickSound === "custom" || clickable.dataset.clickSound === "none") {
        return;
      }

      try {
        if (!audioRef.current) {
          audioRef.current = new Audio("/click-a.mp3");
          audioRef.current.preload = "auto";
        }

        audioRef.current.currentTime = 0;
        void audioRef.current.play();
      } catch (error) {
        console.error(error);
      }
    }

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
