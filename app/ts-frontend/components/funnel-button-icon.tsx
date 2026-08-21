import type { FunnelButtonIcon } from "../lib/funnels/page-document";

export const FUNNEL_BUTTON_ICON_OPTIONS: ReadonlyArray<{
  value: FunnelButtonIcon | "none";
  label: string;
}> = [
  { value: "none", label: "None" },
  { value: "arrow-right", label: "Arrow right" },
  { value: "arrow-left", label: "Arrow left" },
  { value: "chevron-right", label: "Chevron" },
  { value: "check", label: "Check" },
  { value: "shopping-cart", label: "Cart" },
  { value: "download", label: "Download" },
  { value: "book-open", label: "Book" },
  { value: "star", label: "Star" },
  { value: "sparkles", label: "Sparkles" },
  { value: "lock", label: "Lock" },
  { value: "play", label: "Play" },
  { value: "mail", label: "Mail" },
  { value: "gift", label: "Gift" },
  { value: "heart", label: "Heart" },
  { value: "calendar", label: "Calendar" },
  { value: "external-link", label: "External" }
];

export function resolveFunnelButtonIcon(props: {
  icon?: FunnelButtonIcon | "none";
  showArrow?: boolean;
}): FunnelButtonIcon | null {
  if (props.icon) return props.icon === "none" ? null : props.icon;
  return props.showArrow === false ? null : "arrow-right";
}

export function FunnelButtonIconGlyph({
  icon,
  className = "h-5 w-5"
}: {
  icon: FunnelButtonIcon;
  className?: string;
}) {
  const contents = (() => {
    switch (icon) {
      case "arrow-right": return <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>;
      case "arrow-left": return <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>;
      case "chevron-right": return <path d="m9 18 6-6-6-6" />;
      case "check": return <path d="m5 12 4 4L19 6" />;
      case "shopping-cart": return <><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L20.5 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>;
      case "download": return <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>;
      case "book-open": return <><path d="M3 5.5A3.5 3.5 0 0 1 6.5 2H11v17H6.5A3.5 3.5 0 0 0 3 22Z" /><path d="M21 5.5A3.5 3.5 0 0 0 17.5 2H13v17h4.5A3.5 3.5 0 0 1 21 22Z" /></>;
      case "star": return <path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9Z" />;
      case "sparkles": return <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z" /><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z" /><path d="m5 13 .7 1.8 1.8.7-1.8.7L5 18l-.7-1.8-1.8-.7 1.8-.7Z" /></>;
      case "lock": return <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>;
      case "play": return <path d="m8 5 11 7-11 7Z" />;
      case "mail": return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>;
      case "gift": return <><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M12 9v12M3 13h18M7.5 9C5 9 4 7.8 4 6.5S5 4 6.5 4C9 4 12 9 12 9M16.5 9C19 9 20 7.8 20 6.5S19 4 17.5 4C15 4 12 9 12 9" /></>;
      case "heart": return <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />;
      case "calendar": return <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>;
      case "external-link": return <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>;
    }
  })();

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{contents}</svg>;
}
