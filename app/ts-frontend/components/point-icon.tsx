import type { StudentPointIconKey } from "../lib/points/server";

export function PointIcon({
  iconKey,
  customIconUrl,
  className = ""
}: {
  iconKey: StudentPointIconKey;
  customIconUrl?: string | null;
  className?: string;
}) {
  if (iconKey === "custom" && customIconUrl) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block h-[1em] w-[1em] rounded-full bg-cover bg-center bg-no-repeat leading-none ${className}`}
        style={{ backgroundImage: `url("${customIconUrl}")` }}
      />
    );
  }
  const icon = (() => {
    switch (iconKey) {
      case "coin":
        return (
          <>
            <ellipse cx="9" cy="5.5" rx="5.5" ry="2.5" />
            <path d="M3.5 5.5v3c0 1.38 2.46 2.5 5.5 2.5 1.42 0 2.72-.24 3.7-.64" />
            <path d="M3.5 8.5v3c0 1.38 2.46 2.5 5.5 2.5.52 0 1.03-.03 1.5-.1" />
            <ellipse cx="15" cy="14" rx="5.5" ry="2.5" />
            <path d="M9.5 14v3c0 1.38 2.46 2.5 5.5 2.5s5.5-1.12 5.5-2.5v-3" />
          </>
        );
      case "diamond":
        return (
          <>
            <path d="M7.2 4h9.6L21 9l-9 11L3 9l4.2-5Z" />
            <path d="m3 9 6-1 3 12 3-12 6 1M7.2 4 9 8h6l1.8-4" />
          </>
        );
      case "custom":
      case "star":
      default:
        return <path d="m12 2.5 2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.31l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5Z" fill="currentColor" stroke="none" />;
    }
  })();

  return (
    <span aria-hidden="true" className={`inline-flex items-center justify-center leading-none ${className}`}>
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
    </span>
  );
}

export const POINT_ICON_OPTIONS: Array<{
  key: StudentPointIconKey;
  label: string;
}> = [
  { key: "star", label: "Star" },
  { key: "coin", label: "Coin" },
  { key: "diamond", label: "Diamond" }
];
