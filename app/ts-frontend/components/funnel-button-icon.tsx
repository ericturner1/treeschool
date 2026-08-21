import type { FunnelButtonIcon } from "../lib/funnels/page-document";

export const FUNNEL_BUTTON_ICON_OPTIONS: ReadonlyArray<{
  value: FunnelButtonIcon | "none";
  label: string;
  category: "General" | "Navigation" | "Actions" | "Commerce" | "Learning" | "People";
}> = [
  { value: "none", label: "None", category: "General" },
  { value: "star", label: "Star", category: "General" },
  { value: "sparkles", label: "Sparkles", category: "General" },
  { value: "heart", label: "Heart", category: "General" },
  { value: "wand", label: "Magic wand", category: "General" },
  { value: "rocket", label: "Rocket", category: "General" },
  { value: "trophy", label: "Trophy", category: "General" },
  { value: "smile", label: "Smile", category: "General" },
  { value: "circle", label: "Circle", category: "General" },
  { value: "zap", label: "Lightning", category: "General" },
  { value: "flame", label: "Flame", category: "General" },
  { value: "sun", label: "Sun", category: "General" },
  { value: "moon", label: "Moon", category: "General" },
  { value: "leaf", label: "Leaf", category: "General" },
  { value: "arrow-right", label: "Arrow right", category: "Navigation" },
  { value: "arrow-left", label: "Arrow left", category: "Navigation" },
  { value: "arrow-up", label: "Arrow up", category: "Navigation" },
  { value: "arrow-down", label: "Arrow down", category: "Navigation" },
  { value: "chevron-right", label: "Chevron right", category: "Navigation" },
  { value: "chevron-left", label: "Chevron left", category: "Navigation" },
  { value: "chevron-up", label: "Chevron up", category: "Navigation" },
  { value: "chevron-down", label: "Chevron down", category: "Navigation" },
  { value: "external-link", label: "External link", category: "Navigation" },
  { value: "home", label: "Home", category: "Navigation" },
  { value: "globe", label: "Globe", category: "Navigation" },
  { value: "map-pin", label: "Map pin", category: "Navigation" },
  { value: "refresh", label: "Refresh", category: "Navigation" },
  { value: "menu", label: "Menu", category: "Navigation" },
  { value: "log-in", label: "Log in", category: "Navigation" },
  { value: "check", label: "Check", category: "Actions" },
  { value: "plus", label: "Plus", category: "Actions" },
  { value: "minus", label: "Minus", category: "Actions" },
  { value: "download", label: "Download", category: "Actions" },
  { value: "play", label: "Play", category: "Actions" },
  { value: "search", label: "Search", category: "Actions" },
  { value: "settings", label: "Settings", category: "Actions" },
  { value: "info", label: "Information", category: "Actions" },
  { value: "help-circle", label: "Help", category: "Actions" },
  { value: "alert-triangle", label: "Alert", category: "Actions" },
  { value: "calendar", label: "Calendar", category: "Actions" },
  { value: "clock", label: "Clock", category: "Actions" },
  { value: "printer", label: "Print", category: "Actions" },
  { value: "share", label: "Share", category: "Actions" },
  { value: "upload", label: "Upload", category: "Actions" },
  { value: "save", label: "Save", category: "Actions" },
  { value: "copy", label: "Copy", category: "Actions" },
  { value: "edit", label: "Edit", category: "Actions" },
  { value: "trash", label: "Delete", category: "Actions" },
  { value: "eye", label: "View", category: "Actions" },
  { value: "shopping-cart", label: "Cart", category: "Commerce" },
  { value: "gift", label: "Gift", category: "Commerce" },
  { value: "lock", label: "Lock", category: "Commerce" },
  { value: "thumbs-up", label: "Thumbs up", category: "Commerce" },
  { value: "credit-card", label: "Credit card", category: "Commerce" },
  { value: "tag", label: "Price tag", category: "Commerce" },
  { value: "percent", label: "Percent", category: "Commerce" },
  { value: "dollar-sign", label: "Dollar", category: "Commerce" },
  { value: "package", label: "Package", category: "Commerce" },
  { value: "book-open", label: "Book", category: "Learning" },
  { value: "graduation-cap", label: "Graduation", category: "Learning" },
  { value: "file-text", label: "Document", category: "Learning" },
  { value: "image", label: "Image", category: "Learning" },
  { value: "camera", label: "Camera", category: "Learning" },
  { value: "music", label: "Music", category: "Learning" },
  { value: "pencil", label: "Pencil", category: "Learning" },
  { value: "lightbulb", label: "Idea", category: "Learning" },
  { value: "headphones", label: "Headphones", category: "Learning" },
  { value: "video", label: "Video", category: "Learning" },
  { value: "microphone", label: "Microphone", category: "Learning" },
  { value: "mail", label: "Mail", category: "People" },
  { value: "phone", label: "Phone", category: "People" },
  { value: "user", label: "Person", category: "People" },
  { value: "users", label: "People", category: "People" },
  { value: "bell", label: "Bell", category: "People" },
  { value: "message-circle", label: "Message", category: "People" }
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
      case "arrow-up": return <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>;
      case "arrow-down": return <><path d="M12 5v14" /><path d="m18 13-6 6-6-6" /></>;
      case "chevron-right": return <path d="m9 18 6-6-6-6" />;
      case "chevron-left": return <path d="m15 18-6-6 6-6" />;
      case "chevron-up": return <path d="m18 15-6-6-6 6" />;
      case "chevron-down": return <path d="m6 9 6 6 6-6" />;
      case "check": return <path d="m5 12 4 4L19 6" />;
      case "plus": return <><path d="M12 5v14" /><path d="M5 12h14" /></>;
      case "minus": return <path d="M5 12h14" />;
      case "info": return <><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><path d="M12 7h.01" /></>;
      case "help-circle": return <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.7 2.7 0 1 1 4.4 2.1c-1.2.9-1.9 1.4-1.9 2.9" /><path d="M12 18h.01" /></>;
      case "alert-triangle": return <><path d="M10.3 3.6 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>;
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
      case "phone": return <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 1.9Z" />;
      case "map-pin": return <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>;
      case "clock": return <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>;
      case "user": return <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>;
      case "users": return <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>;
      case "home": return <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>;
      case "globe": return <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>;
      case "search": return <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>;
      case "settings": return <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>;
      case "wand": return <><path d="m15 4 5 5L8 21l-5-5Z" /><path d="m6 14 5 5M6 3v3M4.5 4.5h3M19 15v4M17 17h4" /></>;
      case "rocket": return <><path d="M15 4c3-2 5-1 5-1s1 2-1 5l-7 7-4-4Z" /><path d="m9 8-4 1-2 3 5 1M16 15l-1 4-3 2-1-5" /><circle cx="16" cy="7" r="1.5" /><path d="M6 16c-2 0-3 1-3 4 3 0 4-1 4-3" /></>;
      case "trophy": return <><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6" /></>;
      case "graduation-cap": return <><path d="m2 9 10-5 10 5-10 5Z" /><path d="M6 11.2V16c3 2.5 9 2.5 12 0v-4.8M22 9v6" /></>;
      case "music": return <><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>;
      case "camera": return <><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="4" /></>;
      case "image": return <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>;
      case "file-text": return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>;
      case "printer": return <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>;
      case "share": return <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></>;
      case "refresh": return <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" /></>;
      case "thumbs-up": return <><path d="M7 10v11H3V10ZM7 19h10.5a2 2 0 0 0 2-1.7l1.2-7A2 2 0 0 0 18.7 8H14l.7-3.1A2.4 2.4 0 0 0 10 4.2L7 10Z" /></>;
      case "smile": return <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>;
      case "circle": return <circle cx="12" cy="12" r="9" />;
      case "zap": return <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />;
      case "flame": return <path d="M12 22c4 0 7-3 7-7 0-3-1.5-5.5-4.5-8 .2 3-1 4.5-2.2 5.2.3-4.2-2-7.7-5.3-10.2.4 4-2 6.5-2 10.5C5 18 8 22 12 22Z" />;
      case "sun": return <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>;
      case "moon": return <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />;
      case "leaf": return <><path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-7 10-16Z" /><path d="M4 21c3-6 7-9 13-12" /></>;
      case "menu": return <><path d="M4 6h16M4 12h16M4 18h16" /></>;
      case "log-in": return <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>;
      case "upload": return <><path d="M12 21V9M7 14l5-5 5 5" /><path d="M5 4h14" /></>;
      case "save": return <><path d="M5 3h12l4 4v14H3V3Z" /><path d="M7 3v6h10V3M7 21v-8h10v8" /></>;
      case "copy": return <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" /></>;
      case "edit": return <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>;
      case "trash": return <><path d="M3 6h18M8 6V3h8v3M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></>;
      case "eye": return <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>;
      case "credit-card": return <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h3" /></>;
      case "tag": return <><path d="M20 13 13 20 3 10V3h7Z" /><circle cx="8" cy="8" r="1" /></>;
      case "percent": return <><path d="m19 5-14 14" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></>;
      case "dollar-sign": return <><path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>;
      case "package": return <><path d="m3 7 9-5 9 5-9 5Z" /><path d="M3 7v10l9 5 9-5V7M12 12v10" /></>;
      case "pencil": return <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10Z" /><path d="m14 7 3 3M4 20l2-4" /></>;
      case "lightbulb": return <><path d="M9 18h6M10 22h4" /><path d="M8.5 15.5A7 7 0 1 1 15.5 15.5c-.8.7-1.2 1.4-1.3 2.5h-4.4c-.1-1.1-.5-1.8-1.3-2.5Z" /></>;
      case "headphones": return <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h3v7H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 1-2ZM20 14h-3v7h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-1-2Z" /></>;
      case "video": return <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-3v10l-4-3Z" /></>;
      case "microphone": return <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></>;
      case "bell": return <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>;
      case "message-circle": return <><path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.5-4A8.5 8.5 0 1 1 21 11.5Z" /></>;
    }
  })();

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{contents}</svg>;
}
