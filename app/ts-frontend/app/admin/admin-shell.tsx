"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ADMIN_NAVIGATION = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/contacts", label: "Contacts" },
  { href: "/admin/funnels", label: "Funnels" },
  { href: "/admin/blog", label: "Blog" },
  { href: "/admin/faqs", label: "Sales FAQs" },
  { href: "/admin/workbooks", label: "Workbooks" },
  { href: "/admin/workbook-studio", label: "Workbook Studio" }
] as const;

function isFullScreenAdminRoute(pathname: string) {
  return pathname.includes("/preview") ||
    pathname.endsWith("/edit") ||
    /^\/admin\/funnels\/first-grade-curriculum\/(upsell|downsell|us|ds)$/.test(pathname);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isFullScreenAdminRoute(pathname)) return children;

  return (
    <div className="min-h-screen bg-[#f8f1e4] lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="border-b border-[#d8c8ae] bg-[#fffaf2] px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <Link href="/admin" className="block rounded-[14px] px-3 py-2">
          <span className="brand-logo block text-[24px] font-semibold leading-none">treeschool</span>
          <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#567b40]">Administration</span>
        </Link>
        <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible" aria-label="Administration">
          {ADMIN_NAVIGATION.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-[13px] border px-4 py-2.5 text-sm font-semibold transition lg:w-full ${active
                  ? "border-[#9fbd89] bg-[#eaf3e1] text-[#486a38] shadow-[0_3px_0_#c6d8b6]"
                  : "border-transparent text-ink/62 hover:border-[#dfd2c0] hover:bg-white hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-[#e6dac8] pt-4 lg:absolute lg:bottom-6 lg:left-4 lg:right-4">
          <Link href="/p/dashboard" className="block rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-2.5 text-center text-sm font-semibold text-ink/65 hover:text-ink">
            Parent dashboard
          </Link>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
