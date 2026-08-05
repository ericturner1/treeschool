export function FieldHelp({
  label,
  help
}: {
  label: string;
  help: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      <span className="group relative inline-flex">
        <span
          tabIndex={0}
          aria-label={`${label}: ${help}`}
          className="grid h-5 w-5 cursor-help place-items-center rounded-full border border-[#cdbb9f] bg-[#f8f1e7] text-[11px] font-black leading-none text-[#76583d] outline-none transition hover:border-[#8ba66f] hover:bg-[#edf5e6] hover:text-[#4f703c] focus-visible:border-[#739655] focus-visible:ring-4 focus-visible:ring-[#739655]/15"
        >
          ?
        </span>
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-50 w-72 -translate-x-1/2 rounded-[13px] bg-[#30251d] px-4 py-3 text-left text-xs font-medium leading-5 text-white opacity-0 shadow-[0_12px_30px_rgba(32,23,16,.24)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {help}
          <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#30251d]" aria-hidden="true" />
        </span>
      </span>
    </span>
  );
}
