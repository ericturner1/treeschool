"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export type FunnelWorkspaceTab = "configuration" | "experiment" | "leads" | "stats" | "sales";

const TABS: ReadonlyArray<{ key: FunnelWorkspaceTab; label: string }> = [
  { key: "configuration", label: "Configuration" },
  { key: "experiment", label: "A/B test" },
  { key: "leads", label: "Leads" },
  { key: "stats", label: "Stats" },
  { key: "sales", label: "Sales" }
];

function tabFromUrl(): FunnelWorkspaceTab {
  const value = new URL(window.location.href).searchParams.get("tab");
  return TABS.some((tab) => tab.key === value)
    ? value as FunnelWorkspaceTab
    : "configuration";
}

export function FunnelTabWorkspace({
  initialTab,
  selectedStepId,
  experimentStepId,
  selectedPageId,
  panels
}: {
  initialTab: FunnelWorkspaceTab;
  selectedStepId: string;
  experimentStepId: string;
  selectedPageId?: string;
  panels: Record<FunnelWorkspaceTab, ReactNode>;
}) {
  const [activeTab, setActiveTab] = useState<FunnelWorkspaceTab>(initialTab);

  useEffect(() => {
    const handleHistoryChange = () => setActiveTab(tabFromUrl());
    window.addEventListener("popstate", handleHistoryChange);
    return () => window.removeEventListener("popstate", handleHistoryChange);
  }, []);

  function selectTab(nextTab: FunnelWorkspaceTab) {
    if (nextTab === activeTab) return;

    setActiveTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    url.searchParams.set("step", nextTab === "experiment" ? experimentStepId : selectedStepId);
    if (nextTab === "configuration" && selectedPageId) {
      url.searchParams.set("page", selectedPageId);
    } else {
      url.searchParams.delete("page");
    }
    window.history.pushState({}, "", url);
  }

  return (
    <>
      <div className="border-b border-[#eadbc5] px-5 pt-4 sm:px-7">
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Step administration">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              aria-controls={`funnel-tab-panel-${key}`}
              id={`funnel-tab-${key}`}
              onClick={() => selectTab(key)}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors ${
                activeTab === key
                  ? "border-[#6f994f] font-semibold text-[#4f6f3c]"
                  : "border-transparent text-ink/55 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {TABS.map(({ key }) => (
        <div
          key={key}
          id={`funnel-tab-panel-${key}`}
          role="tabpanel"
          aria-labelledby={`funnel-tab-${key}`}
          hidden={activeTab !== key}
        >
          {panels[key]}
        </div>
      ))}
    </>
  );
}
