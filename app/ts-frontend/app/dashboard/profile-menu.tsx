"use client";

import { useEffect, useRef } from "react";

type ProfileMenuProps = {
  summaryLabel: string;
  currentName: string;
  children: React.ReactNode;
};

export function ProfileMenu({
  summaryLabel,
  currentName,
  children
}: ProfileMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (!details?.open) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!details.contains(target)) {
        details.open = false;
      }
    }

    function handleEscape(event: KeyboardEvent) {
      const details = detailsRef.current;
      if (event.key === "Escape" && details?.open) {
        details.open = false;
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className="profile-menu relative z-30 w-full">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-[18px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:border-[#c8af8b]">
        <span>
          {summaryLabel}: {currentName}
        </span>
        <span className="text-earth">▾</span>
      </summary>
      {children}
    </details>
  );
}
