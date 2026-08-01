"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { AdminFunnelStep } from "../../../lib/funnels/server";
import {
  buildFunnelStepHierarchy,
  funnelStepParentSlug,
  moveFunnelStepGroup,
  reorderFunnelStepGroups
} from "../../../lib/funnels/step-hierarchy";
import { reorderFunnelStepsAction } from "./actions";

const TYPE_LABELS: Record<AdminFunnelStep["stepType"], string> = {
  landing: "Landing page",
  sales: "Sales page",
  checkout: "Checkout",
  order_bump: "Order bump",
  upsell: "Upsell",
  downsell: "Downsell",
  thank_you: "Thank you",
  redirect: "Redirect",
  fulfillment: "Fulfillment"
};

export function FunnelStepRail({
  funnelId,
  funnelSlug,
  initialSteps,
  selectedStepId
}: {
  funnelId: string;
  funnelSlug: string;
  initialSteps: AdminFunnelStep[];
  selectedStepId: string | null;
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [expandedParentSlugs, setExpandedParentSlugs] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hierarchy = useMemo(() => buildFunnelStepHierarchy(steps), [steps]);

  useEffect(() => setSteps(initialSteps), [initialSteps]);

  useEffect(() => {
    const selected = steps.find((step) => step.id === selectedStepId);
    const parentSlug = selected ? funnelStepParentSlug(selected) : null;
    if (!parentSlug) return;
    setExpandedParentSlugs((current) => {
      if (current.has(parentSlug)) return current;
      const next = new Set(current);
      next.add(parentSlug);
      return next;
    });
  }, [selectedStepId, steps]);

  function persist(next: AdminFunnelStep[]) {
    const previous = steps;
    setSteps(next);
    setError(null);
    startTransition(async () => {
      const result = await reorderFunnelStepsAction(funnelId, next.map((step) => step.id));
      if (!result.ok) {
        setSteps(previous);
        setError(result.error);
      }
    });
  }

  function move(stepId: string, direction: -1 | 1) {
    if (pending) return;
    const next = moveFunnelStepGroup(steps, stepId, direction);
    if (next !== steps) persist(next);
  }

  function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId || pending) return;
    const next = reorderFunnelStepGroups(steps, draggedId, targetId);
    if (next !== steps) persist(next);
    setDraggedId(null);
  }

  function toggleParent(slug: string) {
    setExpandedParentSlugs((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div>
      <ol className={`space-y-2 ${pending ? "opacity-70" : ""}`} aria-busy={pending}>
        {hierarchy.map(({ step, children }, groupIndex) => {
          const selected = step.id === selectedStepId;
          const expanded = children.length > 0 && expandedParentSlugs.has(step.slug);
          return (
            <li
              key={step.id}
              draggable={!pending}
              onDragStart={(event) => {
                setDraggedId(step.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", step.id);
              }}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropOn(step.id);
              }}
              className={`group overflow-hidden rounded-[18px] border transition ${
                selected
                  ? "border-[#7aa35c] bg-[#eaf3e1] shadow-[0_4px_0_#c6d8b6]"
                  : "border-[#ded3c3] bg-white hover:border-[#b8cfa4]"
              } ${draggedId === step.id ? "scale-[0.98] opacity-45" : ""}`}
            >
              <div className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 p-3">
                <span
                  title="Drag to reorder"
                  className="cursor-grab select-none text-center text-xl leading-none text-ink/28 active:cursor-grabbing"
                  aria-hidden="true"
                >
                  ⠿
                </span>
                <Link
                  href={`/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(step.id)}`}
                  className="min-w-0"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">{step.name}</span>
                    {step.isTopOfFunnel ? (
                      <span className="rounded-full bg-[#dcebd0] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-[#4d6a39]">
                        Top
                      </span>
                    ) : null}
                    {children.length > 0 ? (
                      <span className="rounded-full bg-[#eee8f5] px-2 py-0.5 text-[9px] font-bold text-[#65577e]">
                        {children.length} variants
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink/48">
                    {groupIndex + 1}. {TYPE_LABELS[step.stepType]}
                    {step.status !== "active" ? ` · ${step.status}` : ""}
                  </span>
                </Link>
                <span className="flex items-center gap-0.5">
                  {children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleParent(step.slug)}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Collapse" : "Expand"} variants for ${step.name}`}
                      className="grid h-8 w-8 place-items-center rounded-lg text-earth hover:bg-[#f2e8d8]"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}>
                        <path d="m7.5 4.5 5 5.5-5 5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending || groupIndex === 0}
                    onClick={() => move(step.id, -1)}
                    aria-label={`Move ${step.name} up`}
                    className="grid h-8 w-7 place-items-center rounded-lg text-xs text-earth hover:bg-[#f2e8d8] disabled:opacity-20"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || groupIndex === hierarchy.length - 1}
                    onClick={() => move(step.id, 1)}
                    aria-label={`Move ${step.name} down`}
                    className="grid h-8 w-7 place-items-center rounded-lg text-xs text-earth hover:bg-[#f2e8d8] disabled:opacity-20"
                  >
                    ↓
                  </button>
                </span>
              </div>

              {expanded ? (
                <ol className="mb-3 ml-8 mr-3 space-y-2 border-l-2 border-[#cad9bd] pl-3">
                  {children.map((child, childIndex) => {
                    const childSelected = child.id === selectedStepId;
                    return (
                      <li
                        key={child.id}
                        className={`rounded-[14px] border transition ${
                          childSelected
                            ? "border-[#8a7ca6] bg-[#f2eef8] shadow-[0_3px_0_#d9d2e5]"
                            : "border-[#e1d9e9] bg-[#fbf9fd] hover:border-[#b9accb]"
                        }`}
                      >
                        <Link
                          href={`/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(child.id)}`}
                          className="block px-3 py-2.5"
                        >
                          <span className="block truncate text-sm font-semibold text-ink">{child.name}</span>
                          <span className="mt-0.5 block text-[11px] text-ink/48">
                            Variant {childIndex + 1} · {TYPE_LABELS[child.stepType]}
                            {child.status !== "active" ? ` · ${child.status}` : ""}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
      {pending ? <p className="mt-3 text-xs font-semibold text-[#567b40]">Saving step order…</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-[12px] bg-[#fff0eb] px-3 py-2 text-xs font-semibold text-[#8c4536]">{error}</p> : null}
      <p className="mt-4 text-xs leading-5 text-ink/42">
        Drag journey steps on desktop, or use the arrows on touch devices. Experiment variants remain attached to their parent step.
      </p>
    </div>
  );
}
