"use client";

export function AdminManifestButton({ weeklyPlanId }: { weeklyPlanId: string }) {
  return (
    <a
      href={`/api/paper-plan/manifest?weeklyPlanId=${encodeURIComponent(weeklyPlanId)}`}
      download
      onClick={(event) => event.stopPropagation()}
      title="Download this weekly plan’s complete metadata manifest as JSON."
      aria-label="Download weekly plan metadata as JSON"
      className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-[12px] border border-[#bca98f] bg-white px-3 text-[11px] font-black uppercase tracking-[0.08em] text-earth shadow-[0_3px_0_#d7c5aa] transition-transform hover:-translate-y-0.5"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current stroke-[1.8]">
        <path d="M7 3.5h7l3 3V11M14 3.5V7h3M12 11v7m0 0-3-3m3 3 3-3M7 20.5h10" />
      </svg>
      JSON
    </a>
  );
}
