"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const ADMIN_NAVIGATION = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/contacts", label: "Contacts", icon: "contacts" },
  { href: "/admin/funnels", label: "Funnels", icon: "funnel" },
  { href: "/admin/blog", label: "Blog", icon: "blog" },
  { href: "/admin/faqs", label: "Sales FAQs", icon: "faq" },
  { href: "/admin/workbooks", label: "Workbooks", icon: "workbooks" },
  { href: "/admin/workbook-studio", label: "Workbook Studio", icon: "studio" },
  { href: "/admin/backups", label: "Backups", icon: "backups" }
] as const;

type AdminIconName = (typeof ADMIN_NAVIGATION)[number]["icon"] | "parent" | "collapse" | "expand";

const ADMIN_SIDEBAR_STORAGE_KEY = "treeschool_admin_sidebar_collapsed";

function AdminIcon({ name, className = "h-5 w-5" }: { name: AdminIconName; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  if (name === "dashboard") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  if (name === "contacts") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (name === "funnel") return <svg {...common}><path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" /></svg>;
  if (name === "blog") return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></svg>;
  if (name === "faq") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 3.4 2.34c-.65.3-1 .85-1 1.66M12 17h.01" /></svg>;
  if (name === "workbooks") return <svg {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg>;
  if (name === "studio") return <svg {...common}><path d="m12 3 1.35 3.65L17 8l-3.65 1.35L12 13l-1.35-3.65L7 8l3.65-1.35L12 3ZM5.5 13l.8 2.2 2.2.8-2.2.8L5.5 19l-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></svg>;
  if (name === "backups") return <svg {...common}><ellipse cx="12" cy="5" rx="7.5" ry="3" /><path d="M4.5 5v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V5M4.5 11v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" /><path d="M16.5 8.5h.01M16.5 14.5h.01" /></svg>;
  if (name === "parent") return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
  if (name === "collapse") return <svg {...common}><path d="m13 17-5-5 5-5M19 17l-5-5 5-5" /></svg>;
  return <svg {...common}><path d="m11 7 5 5-5 5M5 7l5 5-5 5" /></svg>;
}

function CompactTooltip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-[9px] bg-[#253023] px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg group-hover:lg:block group-focus-visible:lg:block">
      {children}
    </span>
  );
}

function isFullScreenAdminRoute(pathname: string) {
  return pathname.includes("/preview") ||
    pathname.endsWith("/edit") ||
    /^\/admin\/funnels\/first-grade-curriculum\/(upsell|downsell|us|ds)$/.test(pathname);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === "true");
    } catch {
      // The sidebar remains expanded when storage is unavailable.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // The current page can still use the compact state without persistence.
      }
      return next;
    });
  };

  if (isFullScreenAdminRoute(pathname)) return children;

  return (
    <div className={`min-h-screen bg-[#f8f1e4] lg:grid ${collapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[230px_minmax(0,1fr)]"}`}>
      <aside className={`border-b border-[#d8c8ae] bg-[#fffaf2] px-4 py-4 transition-[padding] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:py-6 ${collapsed ? "lg:px-2" : "lg:px-4"}`}>
        <div className={`flex items-center gap-2 ${collapsed ? "lg:flex-col" : "lg:justify-between"}`}>
          <Link href="/admin" title="Administration dashboard" className={`min-w-0 rounded-[14px] px-3 py-2 ${collapsed ? "lg:px-1 lg:py-1" : ""}`}>
            <Image src="/tree-icon.png" alt="" width={40} height={40} className={`hidden object-contain ${collapsed ? "lg:block lg:h-10 lg:w-10" : ""}`} />
            <span className={`brand-logo block text-[24px] font-semibold leading-none ${collapsed ? "lg:sr-only" : ""}`}>treeschool</span>
            <span className={`mt-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#567b40] ${collapsed ? "lg:sr-only" : ""}`}>Administration</span>
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="relative hidden h-9 w-9 flex-none items-center justify-center rounded-[11px] border border-[#d8c8ae] bg-white text-ink/55 transition hover:border-[#9fbd89] hover:text-[#486a38] lg:inline-flex"
          >
            <AdminIcon name={collapsed ? "expand" : "collapse"} className="h-[18px] w-[18px]" />
          </button>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible" aria-label="Administration">
          {ADMIN_NAVIGATION.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={`group relative flex items-center gap-3 whitespace-nowrap rounded-[13px] border px-4 py-2.5 text-sm font-semibold transition lg:w-full ${collapsed ? "lg:justify-center lg:px-2" : ""} ${active
                  ? "border-[#9fbd89] bg-[#eaf3e1] text-[#486a38] shadow-[0_3px_0_#c6d8b6]"
                  : "border-transparent text-ink/62 hover:border-[#dfd2c0] hover:bg-white hover:text-ink"
                }`}
              >
                <AdminIcon name={item.icon} className="h-5 w-5 flex-none" />
                <span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>
                {collapsed ? <CompactTooltip>{item.label}</CompactTooltip> : null}
              </Link>
            );
          })}
        </nav>
        <div className={`mt-4 border-t border-[#e6dac8] pt-4 lg:absolute lg:bottom-6 ${collapsed ? "lg:left-2 lg:right-2" : "lg:left-4 lg:right-4"}`}>
          <Link href="/p/dashboard" title={collapsed ? "Parent dashboard" : undefined} className={`group relative flex items-center justify-center gap-2 rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-2.5 text-center text-sm font-semibold text-ink/65 hover:text-ink ${collapsed ? "lg:px-2" : ""}`}>
            <AdminIcon name="parent" className="h-5 w-5 flex-none" />
            <span className={collapsed ? "lg:sr-only" : ""}>Parent dashboard</span>
            {collapsed ? <CompactTooltip>Parent dashboard</CompactTooltip> : null}
          </Link>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
