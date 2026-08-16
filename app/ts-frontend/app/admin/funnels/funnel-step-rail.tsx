"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type ReactNode
} from "react";
import { useFormStatus } from "react-dom";
import type { AdminFunnel, AdminFunnelStep } from "../../../lib/funnels/server";
import { findFunnelJourneyIssues } from "../../../lib/funnels/journey-reachability";
import {
  buildFunnelStepHierarchy,
  funnelStepParentSlug,
  moveFunnelStepGroup,
  reorderFunnelStepGroupsAtIndex
} from "../../../lib/funnels/step-hierarchy";
import {
  copyFunnelStepToFunnelAction,
  deleteFunnelStepAction,
  duplicateFunnelStepAction,
  reorderFunnelStepsAction
} from "./actions";

type FunnelCopyDestination = Pick<AdminFunnel, "id" | "slug" | "name" | "status">;

const TYPE_LABELS: Record<AdminFunnelStep["stepType"], string> = {
  landing: "Landing page",
  sales: "Sales page",
  order_form: "Order form",
  upsell: "Upsell",
  downsell: "Downsell",
  thank_you: "Thank you",
  redirect: "Redirect",
  fulfillment: "Fulfillment"
};

function FunnelStepIcon({
  stepType,
  experiment = false,
  locked = false
}: {
  stepType: AdminFunnelStep["stepType"];
  experiment?: boolean;
  locked?: boolean;
}) {
  const artwork = experiment ? (
    <>
      <path d="M5 4.5v2.2c0 2 1.2 3.3 3.2 3.3h3.6c2 0 3.2 1.3 3.2 3.3v2.2" />
      <path d="m12.4 13 2.6 2.6 2.6-2.6M12.4 7 15 4.4 17.6 7" />
    </>
  ) : stepType === "order_form" ? (
    <>
      <path d="M3.5 5h2l1.3 7.1h8.5l1.4-4.8H6.1" />
      <circle cx="8" cy="15.7" r=".9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="15.7" r=".9" fill="currentColor" stroke="none" />
      <path d="M12.5 4.2h4M14.5 2.2v4" />
    </>
  ) : stepType === "upsell" ? (
    <>
      <path d="M3.5 14.5 8 10l3 2.6L16.5 7" />
      <path d="M12.5 7h4v4" />
    </>
  ) : stepType === "downsell" ? (
    <>
      <path d="m3.5 6.5 4.5 4.4 3-2.5 5.5 5.5" />
      <path d="M12.5 14h4v-4" />
    </>
  ) : stepType === "thank_you" ? (
    <>
      <path d="M3.5 5h2l1.3 7.1h8.5l1.4-4.8H6.1" />
      <path d="m10.5 8.5 1.5 1.4 2.8-3" />
      <circle cx="8" cy="15.7" r=".9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="15.7" r=".9" fill="currentColor" stroke="none" />
    </>
  ) : stepType === "redirect" ? (
    <>
      <path d="M4 6.5h7.3a4 4 0 0 1 4 4v3" />
      <path d="m12.6 11 2.7 2.7L18 11" />
    </>
  ) : stepType === "fulfillment" ? (
    <>
      <path d="m4 7 6-3 6 3-6 3-6-3Z" />
      <path d="M4 7v6l6 3 6-3V7M10 10v6" />
    </>
  ) : (
    <>
      <rect x="4" y="3.5" width="12" height="13" rx="2" />
      <path d="M7 7h6M7 10h6M7 13h3.5" />
      {stepType === "sales" ? <circle cx="14.6" cy="14.5" r="2.4" fill="#e8edf1" /> : null}
      {stepType === "sales" ? <path d="M14.6 13.2v2.6M15.5 13.7c-.3-.3-.6-.4-.9-.4-.5 0-.8.2-.8.6 0 .9 1.7.4 1.7 1.2 0 .4-.4.7-.9.7-.4 0-.8-.2-1-.4" strokeWidth="1" /> : null}
    </>
  );

  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[#e8edf1] text-[#8196a7]">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-6 w-6">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
          {artwork}
        </g>
      </svg>
      {locked ? (
        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full border-2 border-white bg-[#7b708c] text-white">
          <svg viewBox="0 0 12 12" aria-hidden="true" className="h-2.5 w-2.5">
            <rect x="2.3" y="5" width="7.4" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M4 5V3.8a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
          </svg>
        </span>
      ) : null}
    </span>
  );
}

function StepMenuSubmitButton({
  children,
  confirmMessage,
  danger = false
}: {
  children: ReactNode;
  confirmMessage?: string;
  danger?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault();
      }}
      className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-wait disabled:opacity-55 ${
        danger
          ? "text-[#9a4334] hover:bg-[#fff0eb]"
          : "text-ink/75 hover:bg-[#f3ecdf] hover:text-ink"
      }`}
    >
      {pending ? <span className="ts-spinner h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function FunnelStepMenu({
  funnelId,
  funnelSlug,
  step,
  canMoveUp,
  canMoveDown,
  onMove,
  onCopy
}: {
  funnelId: string;
  funnelSlug: string;
  step: AdminFunnelStep;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (direction: -1 | 1) => void;
  onCopy: () => void;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      const menu = menuRef.current;
      if (!menu?.open || !(event.target instanceof Node) || menu.contains(event.target)) return;
      menu.open = false;
    }

    function closeOnEscape(event: KeyboardEvent) {
      const menu = menuRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      menu.open = false;
      menu.querySelector<HTMLElement>("summary")?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details
      ref={menuRef}
      className="group/menu relative z-20 open:z-[80]"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      draggable={false}
    >
      <summary
        aria-label={`Actions for ${step.name}`}
        className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-[10px] border border-transparent text-earth/65 transition hover:border-[#dfd2c0] hover:bg-[#f3ede3] hover:text-earth group-open/menu:border-[#d8c7ae] group-open/menu:bg-[#eee4d5] group-open/menu:text-earth marker:hidden [&::-webkit-details-marker]:hidden"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5">
          <circle cx="4.25" cy="10" r="1.6" fill="currentColor" />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" />
          <circle cx="15.75" cy="10" r="1.6" fill="currentColor" />
        </svg>
      </summary>
      <div className="absolute right-0 top-9 z-50 w-48 rounded-[14px] border border-[#d8c7ae] bg-white p-1.5 shadow-[0_16px_38px_rgba(65,43,28,.2)]">
        {onMove ? (
          <>
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-ink/75 transition hover:bg-[#f3ecdf] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span aria-hidden="true">↑</span> Move up
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-ink/75 transition hover:bg-[#f3ecdf] hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <span aria-hidden="true">↓</span> Move down
            </button>
            <div className="my-1 border-t border-[#eee4d5]" />
          </>
        ) : null}
        <form action={duplicateFunnelStepAction}>
          <input type="hidden" name="funnelId" value={funnelId} />
          <input type="hidden" name="funnelSlug" value={funnelSlug} />
          <input type="hidden" name="stepId" value={step.id} />
          <StepMenuSubmitButton>
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0">
              <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4.5 13.5h-1v-9h9v1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
            </svg>
            Duplicate step
          </StepMenuSubmitButton>
        </form>
        <button
          type="button"
          onClick={() => {
            if (menuRef.current) menuRef.current.open = false;
            onCopy();
          }}
          className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-ink/75 transition hover:bg-[#f3ecdf] hover:text-ink"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0">
            <rect x="3.5" y="4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8.5 15.5h7v-7M12 8.5h3.5V12" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
          </svg>
          Copy to funnel…
        </button>
        <form action={deleteFunnelStepAction}>
          <input type="hidden" name="funnelId" value={funnelId} />
          <input type="hidden" name="funnelSlug" value={funnelSlug} />
          <input type="hidden" name="stepId" value={step.id} />
          <StepMenuSubmitButton danger confirmMessage={`Delete “${step.name}”? This cannot be undone.`}>
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0">
              <path d="M6.5 6.8v8.1h7V6.8M5.4 5.2h9.2M8.2 5.2V3.8h3.6v1.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
            </svg>
            Delete step
          </StepMenuSubmitButton>
        </form>
      </div>
    </details>
  );
}

function CopyToFunnelSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#76a456] px-5 py-3 font-semibold text-white shadow-[0_5px_0_#4f7736] transition hover:bg-[#6b984d] disabled:cursor-not-allowed disabled:bg-[#b8c5ae] disabled:shadow-[0_5px_0_#94a28b]"
    >
      {pending ? <span className="ts-spinner h-4 w-4" aria-hidden="true" /> : null}
      {pending ? "Copying…" : "Copy page"}
    </button>
  );
}

function CopyStepToFunnelDialog({
  currentFunnelId,
  currentFunnelSlug,
  destinations,
  step,
  onClose
}: {
  currentFunnelId: string;
  currentFunnelSlug: string;
  destinations: FunnelCopyDestination[];
  step: AdminFunnelStep;
  onClose: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-[#2f241c]/55 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-funnel-step-title"
        className="w-full max-w-lg rounded-[24px] border border-[#d8c5a8] bg-[#fffaf2] p-5 shadow-[0_24px_70px_rgba(47,36,28,.32)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#66864d]">Copy page</p>
            <h2 id="copy-funnel-step-title" className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-ink">
              Copy “{step.name}”
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close copy dialog"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dfd0bc] bg-white text-xl text-earth transition hover:border-[#a88968]"
          >
            ×
          </button>
        </div>

        <form action={copyFunnelStepToFunnelAction} className="mt-6">
          <input type="hidden" name="sourceFunnelId" value={currentFunnelId} />
          <input type="hidden" name="currentFunnelSlug" value={currentFunnelSlug} />
          <input type="hidden" name="stepId" value={step.id} />
          <label className="grid gap-2 text-sm font-semibold text-ink/82">
            Destination funnel
            <select
              name="destinationFunnelId"
              required
              autoFocus
              defaultValue={destinations[0]?.id ?? ""}
              disabled={destinations.length === 0}
              className="min-h-12 w-full rounded-[14px] border border-[#d8c5a8] bg-white px-4 py-3 text-base font-normal text-ink outline-none transition focus:border-[#739655] focus:ring-4 focus:ring-[#739655]/15 disabled:bg-[#f1ebe2] disabled:text-ink/45"
            >
              {destinations.length === 0 ? <option value="">No other funnels available</option> : null}
              {destinations.map((funnel) => (
                <option key={funnel.id} value={funnel.id}>
                  {funnel.name} · {funnel.status}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-sm leading-6 text-ink/55">
            The latest editable page and its uploaded images will be copied as a new draft. Its URL, publishing state, experiments, leads, sales, and analytics stay behind.
          </p>
          {destinations.length === 0 ? (
            <p role="status" className="mt-3 rounded-[12px] bg-[#f7ead8] px-3 py-2 text-sm font-semibold text-[#76552f]">
              Create another funnel before copying this page.
            </p>
          ) : null}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 rounded-[14px] border border-[#d8c5a8] bg-white px-5 py-3 font-semibold text-earth transition hover:border-[#a88968]"
            >
              Cancel
            </button>
            <CopyToFunnelSubmitButton disabled={destinations.length === 0} />
          </div>
        </form>
      </section>
    </div>
  );
}

function FunnelDropPreview({
  active,
  stepName
}: {
  active: boolean;
  stepName: string | null;
}) {
  return (
    <li
      aria-hidden={!active}
      className={`overflow-hidden transition-[height,margin,opacity] duration-150 ease-out ${
        active ? "mb-2 h-11 opacity-100" : "h-0 opacity-0"
      }`}
    >
      <div className="flex h-9 items-center gap-2 rounded-[13px] border-2 border-dashed border-[#739655] bg-[#eef6e7] px-3 text-xs font-semibold text-[#496936] shadow-[0_3px_0_#c8dbb8]">
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0">
          <path d="M10 3v11m-4-4 4 4 4-4M4 17h12" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
        <span className="truncate">Move “{stepName ?? "step"}” here</span>
      </div>
    </li>
  );
}

export function FunnelStepRail({
  funnelId,
  funnelSlug,
  initialSteps,
  selectedStepId,
  copyDestinations
}: {
  funnelId: string;
  funnelSlug: string;
  initialSteps: AdminFunnelStep[];
  selectedStepId: string | null;
  copyDestinations: FunnelCopyDestination[];
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [expandedParentSlugs, setExpandedParentSlugs] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copyStep, setCopyStep] = useState<AdminFunnelStep | null>(null);
  const hierarchy = useMemo(() => buildFunnelStepHierarchy(steps), [steps]);
  const journeyIssues = useMemo(() => findFunnelJourneyIssues(steps), [steps]);
  const draggedGroupIndex = draggedId
    ? hierarchy.findIndex(({ step }) => step.id === draggedId)
    : -1;
  const draggedStepName = draggedGroupIndex >= 0
    ? hierarchy[draggedGroupIndex]?.step.name ?? null
    : null;

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
    const ordered = next.map((step, index) => ({
      ...step,
      isTopOfFunnel: index === 0
    }));
    setSteps(ordered);
    setError(null);
    startTransition(async () => {
      const result = await reorderFunnelStepsAction(funnelId, ordered.map((step) => step.id));
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

  function validDropIndex(insertionIndex: number) {
    if (draggedGroupIndex < 0) return null;
    return insertionIndex === draggedGroupIndex || insertionIndex === draggedGroupIndex + 1
      ? null
      : insertionIndex;
  }

  function previewDrop(event: DragEvent<HTMLLIElement>, groupIndex: number) {
    if (!draggedId || pending) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const insertionIndex = event.clientY < bounds.top + bounds.height / 2
      ? groupIndex
      : groupIndex + 1;
    setDropIndex(validDropIndex(insertionIndex));
  }

  function dropAt(insertionIndex: number | null) {
    if (!draggedId || insertionIndex === null || pending) return;
    const next = reorderFunnelStepGroupsAtIndex(steps, draggedId, insertionIndex);
    if (next !== steps) persist(next);
    setDraggedId(null);
    setDropIndex(null);
  }

  function finishDragging() {
    setDraggedId(null);
    setDropIndex(null);
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
      <ol
        className={pending ? "opacity-70" : ""}
        aria-busy={pending}
        onDragOver={(event) => {
          if (!draggedId || pending) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          dropAt(dropIndex);
        }}
      >
        {hierarchy.map(({ step, children }, groupIndex) => {
          const selected = step.id === selectedStepId;
          const expanded = children.length > 0 && expandedParentSlugs.has(step.slug);
          const journeyIssue = journeyIssues.get(step.id);
          return (
            <Fragment key={step.id}>
              <FunnelDropPreview
                active={draggedId !== null && dropIndex === groupIndex}
                stepName={draggedStepName}
              />
              <li
                draggable={!pending}
                onDragStart={(event) => {
                  setDraggedId(step.id);
                  setDropIndex(null);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", step.id);
                }}
                onDragEnd={finishDragging}
                onDragOver={(event) => previewDrop(event, groupIndex)}
                title={journeyIssue?.message}
                className={`group relative mb-2 cursor-grab rounded-[18px] border transition active:cursor-grabbing ${
                  journeyIssue
                    ? "border-[#c84f3b] bg-[#fff4f0] shadow-[0_4px_0_#e8b0a5]"
                    : selected
                    ? "border-[#7aa35c] bg-[#eaf3e1] shadow-[0_4px_0_#c6d8b6]"
                    : "border-[#ded3c3] bg-white hover:border-[#b8cfa4]"
                } ${draggedId === step.id ? "scale-[0.98] opacity-45" : ""}`}
              >
              <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2.5 p-3">
                <FunnelStepIcon stepType={step.stepType} experiment={children.length > 0} />
                <Link
                  href={children.length > 0
                    ? `/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(step.id)}&tab=experiment`
                    : `/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(step.id)}`}
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
                    {journeyIssue ? (
                      <span className="rounded-full bg-[#f4d3cc] px-2 py-0.5 text-[9px] font-bold text-[#943c2f]">
                        Dead end
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink/48">
                    {groupIndex + 1}. {TYPE_LABELS[step.stepType]}
                    {step.status !== "active" ? ` · ${step.status}` : ""}
                  </span>
                </Link>
                <div className="flex items-center gap-1">
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
                  <FunnelStepMenu
                    funnelId={funnelId}
                    funnelSlug={funnelSlug}
                    step={step}
                    canMoveUp={!pending && groupIndex > 0}
                    canMoveDown={!pending && groupIndex < hierarchy.length - 1}
                    onMove={(direction) => move(step.id, direction)}
                    onCopy={() => setCopyStep(step)}
                  />
                </div>
              </div>

              {expanded ? (
                <ol className="mb-3 ml-8 mr-3 space-y-2 border-l-2 border-[#cad9bd] pl-3">
                  {children.map((child, childIndex) => {
                    const childSelected = child.id === selectedStepId;
                    const childIssue = journeyIssues.get(child.id);
                    return (
                      <li
                        key={child.id}
                        title={childIssue?.message}
                        className={`rounded-[14px] border transition ${
                          childIssue
                            ? "border-[#c84f3b] bg-[#fff4f0] shadow-[0_3px_0_#e8b0a5]"
                            : childSelected
                            ? "border-[#8a7ca6] bg-[#f2eef8] shadow-[0_3px_0_#d9d2e5]"
                            : "border-[#e1d9e9] bg-[#fbf9fd] hover:border-[#b9accb]"
                        }`}
                      >
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <span title="This variant stays attached while the A/B test is running">
                            <FunnelStepIcon stepType={child.stepType} locked />
                          </span>
                          <Link
                            href={`/admin/funnels/${encodeURIComponent(funnelSlug)}?step=${encodeURIComponent(child.id)}`}
                            className="block min-w-0 flex-1"
                          >
                            <span className="flex items-center gap-2">
                              <span className="block min-w-0 flex-1 truncate text-sm font-semibold text-ink">{child.name}</span>
                              {childIssue ? (
                                <span className="shrink-0 rounded-full bg-[#f4d3cc] px-2 py-0.5 text-[9px] font-bold text-[#943c2f]">
                                  Dead end
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-ink/48">
                              Variant {childIndex + 1} · {TYPE_LABELS[child.stepType]}
                              {child.status !== "active" ? ` · ${child.status}` : ""}
                            </span>
                          </Link>
                          <FunnelStepMenu
                            funnelId={funnelId}
                            funnelSlug={funnelSlug}
                            step={child}
                            onCopy={() => setCopyStep(child)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              </li>
              {groupIndex === hierarchy.length - 1 ? (
                <FunnelDropPreview
                  active={draggedId !== null && dropIndex === hierarchy.length}
                  stepName={draggedStepName}
                />
              ) : null}
            </Fragment>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {draggedId && dropIndex !== null
          ? `Move ${draggedStepName ?? "step"} to position ${dropIndex + 1}.`
          : ""}
      </p>
      {pending ? <p className="mt-3 text-xs font-semibold text-[#567b40]">Saving step order…</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-[12px] bg-[#fff0eb] px-3 py-2 text-xs font-semibold text-[#8c4536]">{error}</p> : null}
      {journeyIssues.size > 0 ? (
        <p role="alert" className="mt-3 rounded-[12px] border border-[#e0ac9f] bg-[#fff0eb] px-3 py-2 text-xs font-semibold leading-5 text-[#8c4536]">
          Red steps interrupt the customer journey. Add an onward button or automatic redirect before making the funnel live.
        </p>
      ) : null}
      <p className="mt-4 text-xs leading-5 text-ink/42">
        Drag journey steps on desktop, or use the arrows on touch devices. Experiment variants remain attached to their parent step.
      </p>
      {copyStep ? (
        <CopyStepToFunnelDialog
          currentFunnelId={funnelId}
          currentFunnelSlug={funnelSlug}
          destinations={copyDestinations}
          step={copyStep}
          onClose={() => setCopyStep(null)}
        />
      ) : null}
    </div>
  );
}
