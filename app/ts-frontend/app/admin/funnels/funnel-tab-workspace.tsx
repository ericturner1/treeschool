"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { FunnelStepDetailTab } from "../../../lib/funnels/step-detail-tabs";

export type FunnelWorkspaceTab = FunnelStepDetailTab;

const TABS: ReadonlyArray<{ key: FunnelWorkspaceTab; label: string }> = [
  { key: "configuration", label: "Configuration" },
  { key: "versions", label: "Versions" },
  { key: "experiment", label: "A/B test" },
  { key: "leads", label: "Leads" },
  { key: "stats", label: "Stats" },
  { key: "sales", label: "Sales" }
];

function tabFromUrl(availableTabs: ReadonlyArray<FunnelWorkspaceTab>): FunnelWorkspaceTab {
  const value = new URL(window.location.href).searchParams.get("tab");
  return availableTabs.includes(value as FunnelWorkspaceTab)
    ? value as FunnelWorkspaceTab
    : availableTabs[0] ?? "configuration";
}

export function FunnelTabWorkspace({
  initialTab,
  selectedStepId,
  experimentStepId,
  availableTabs,
  panels
}: {
  initialTab: FunnelWorkspaceTab;
  selectedStepId: string;
  experimentStepId: string;
  availableTabs?: ReadonlyArray<FunnelWorkspaceTab>;
  panels: Record<FunnelWorkspaceTab, ReactNode>;
}) {
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => !availableTabs || availableTabs.includes(tab.key)),
    [availableTabs]
  );
  const normalizedInitialTab = visibleTabs.some((tab) => tab.key === initialTab)
    ? initialTab
    : visibleTabs[0]?.key ?? "configuration";
  const [activeTab, setActiveTab] = useState<FunnelWorkspaceTab>(normalizedInitialTab);

  useEffect(() => {
    setActiveTab(normalizedInitialTab);
  }, [normalizedInitialTab, selectedStepId]);

  useEffect(() => {
    const handleHistoryChange = () => setActiveTab(tabFromUrl(visibleTabs.map((tab) => tab.key)));
    window.addEventListener("popstate", handleHistoryChange);
    return () => window.removeEventListener("popstate", handleHistoryChange);
  }, [visibleTabs]);

  function selectTab(nextTab: FunnelWorkspaceTab) {
    if (nextTab === activeTab) return;

    setActiveTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    url.searchParams.set("step", nextTab === "experiment" ? experimentStepId : selectedStepId);
    url.searchParams.delete("page");
    window.history.pushState({}, "", url);
  }

  return (
    <>
      <div className="border-b border-[#eadbc5] bg-[#fffdf8] px-4 pt-1 sm:px-6">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Step administration">
          {visibleTabs.map(({ key, label }) => (
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
                  : "border-transparent text-ink/50 hover:border-[#d7c9b5] hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleTabs.map(({ key }) => (
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
