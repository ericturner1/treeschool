"use client";

import { usePathname, useSearchParams } from "next/navigation";

type LanguageOption = {
  code: string;
  label: string;
};

type LanguageSelectProps = {
  ariaLabel: string;
  currentLocale: string;
  options: readonly LanguageOption[];
};

export function LanguageSelect({
  ariaLabel,
  currentLocale,
  options,
}: LanguageSelectProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      aria-label={ariaLabel}
      className="select-on-dark min-h-11 rounded-[14px] border border-white/15 bg-[#4a372c] px-4 text-sm font-semibold text-[#f7eddf] outline-none transition-colors hover:border-white/30"
      value={currentLocale}
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("lang", event.target.value);
        window.location.assign(`${pathname}?${params.toString()}`);
      }}
    >
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
