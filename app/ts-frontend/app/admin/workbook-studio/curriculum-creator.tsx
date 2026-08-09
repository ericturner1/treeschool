"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkbookStudioSummary } from "../../../lib/workbook-studio/server";
import { createWorkbookStudioCurriculumAction } from "./actions";
import { WorkbookStandardFields } from "./workbook-standard-fields";

export function CurriculumCreator({
  academicStandards,
}: {
  academicStandards: WorkbookStudioSummary["academicStandards"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cta-button cta-button--outline"
      >
        New curriculum
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#25201b]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-curriculum-title"
        >
          <form
            className="w-full max-w-xl rounded-[26px] border border-[#d8c8ae] bg-[#fffaf2] p-6 shadow-2xl sm:p-8"
            action={(formData) => {
              setError("");
              startTransition(async () => {
                const result = await createWorkbookStudioCurriculumAction({
                  name: String(formData.get("name") ?? ""),
                  academicStandardKey: String(
                    formData.get("academicStandardKey") ?? "",
                  ),
                  standardCode:
                    String(formData.get("standardCode") ?? "").trim() || null,
                  standardLabel:
                    String(formData.get("standardLabel") ?? "").trim() || null,
                  gradeLevel: Number(formData.get("gradeLevel")),
                  languageCode: String(formData.get("languageCode") ?? "en"),
                });
                if (!result.ok) return setError(result.error);
                router.push(
                  `/admin/workbook-studio/curricula/${result.curriculumId}`,
                );
                router.refresh();
              });
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#567b40]">
                  Plan before generation
                </p>
                <h2
                  id="new-curriculum-title"
                  className="mt-1 text-3xl font-semibold tracking-[-0.04em]"
                >
                  Create curriculum
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[#d8c8ae] px-3 py-1.5 text-sm font-bold"
              >
                Close
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">
                Name
                <input
                  name="name"
                  required
                  placeholder="US Common Core · Grade 2"
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                Grade
                <input
                  name="gradeLevel"
                  type="number"
                  min="0"
                  max="20"
                  defaultValue="1"
                  required
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                />
              </label>
              <WorkbookStandardFields standards={academicStandards} />
              <label className="grid gap-1.5 text-sm font-bold">
                Standard code
                <input
                  name="standardCode"
                  placeholder="CCSS"
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                Standard name
                <input
                  name="standardLabel"
                  placeholder="US Common Core"
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                />
              </label>
            </div>
            {error ? (
              <p className="mt-4 rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm text-[#8c3f2f]">
                {error}
              </p>
            ) : null}
            <button
              disabled={pending}
              className="cta-button cta-button--dark mt-6 inline-flex w-full items-center justify-center gap-2 disabled:opacity-55"
            >
              {pending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : null}
              {pending ? "Creating…" : "Create and plan"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
