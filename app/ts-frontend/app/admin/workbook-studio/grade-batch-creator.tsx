"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkbookStudioSummary } from "../../../lib/workbook-studio/server";
import { queueWorkbookGradeLevelGenerationAction } from "./actions";

export function GradeBatchCreator({
  prompts,
  themes,
}: {
  prompts: WorkbookStudioSummary["prompts"];
  themes: WorkbookStudioSummary["themes"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const catalogPrompts = prompts.filter(
    (prompt) => prompt.kind === "catalog_plan" && prompt.publishedVersionId,
  );
  const workbookPrompts = prompts.filter(
    (prompt) => prompt.kind === "workflow" && prompt.publishedVersionId,
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cta-button cta-button--outline"
      >
        Generate a grade
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#25201b]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="grade-batch-title"
        >
          <form
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-[#d8c8ae] bg-[#fffaf2] p-6 shadow-2xl sm:p-8"
            action={(formData) => {
              setError("");
              startTransition(async () => {
                const result = await queueWorkbookGradeLevelGenerationAction({
                  curriculumName: String(formData.get("curriculumName") ?? ""),
                  standardCode:
                    String(formData.get("standardCode") ?? "").trim() || null,
                  standardLabel:
                    String(formData.get("standardLabel") ?? "").trim() || null,
                  gradeLevel: Number(formData.get("gradeLevel")),
                  languageCode: String(formData.get("languageCode") ?? "en"),
                  catalogPromptVersionId: String(
                    formData.get("catalogPromptVersionId") ?? "",
                  ),
                  workbookPromptVersionId: String(
                    formData.get("workbookPromptVersionId") ?? "",
                  ),
                  defaultThemeVersionId:
                    String(formData.get("defaultThemeVersionId") ?? "") || null,
                });
                if (!result.ok) return setError(result.error);
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#567b40]">
                  Batch generation
                </p>
                <h2
                  id="grade-batch-title"
                  className="mt-1 text-3xl font-semibold tracking-[-0.04em]"
                >
                  Generate a full grade
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
            <p className="mt-3 text-sm leading-6 text-ink/55">
              The catalog planner proposes subjects and locale variants as a
              versioned curriculum plan. Review or edit that plan first; then
              generate its workbooks through the normal curriculum → outline →
              content → validation → PDF workflow.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">
                Curriculum name
                <input
                  name="curriculumName"
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
              <label className="grid gap-1.5 text-sm font-bold">
                Language
                <input
                  name="languageCode"
                  defaultValue="en"
                  required
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                />
              </label>
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
              <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">
                Catalog planning prompt
                <select
                  name="catalogPromptVersionId"
                  required
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                >
                  <option value="">Choose a published catalog prompt</option>
                  {catalogPrompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.publishedVersionId!}>
                      {prompt.name} · v{prompt.versionNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">
                Workbook workflow
                <select
                  name="workbookPromptVersionId"
                  required
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                >
                  <option value="">Choose a published workbook workflow</option>
                  {workbookPrompts.map((prompt) => (
                    <option key={prompt.id} value={prompt.publishedVersionId!}>
                      {prompt.name} · v{prompt.versionNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">
                Default theme
                <select
                  name="defaultThemeVersionId"
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                >
                  <option value="">Classic</option>
                  {themes
                    .filter(
                      (theme) =>
                        theme.publishedVersionId && theme.slug !== "classic",
                    )
                    .map((theme) => (
                      <option key={theme.id} value={theme.publishedVersionId!}>
                        {theme.name} · v{theme.versionNumber}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {!catalogPrompts.length || !workbookPrompts.length ? (
              <p className="mt-4 rounded-[12px] bg-[#fff0cf] px-4 py-3 text-sm text-[#76571f]">
                Import or create both a published catalog-plan prompt and a
                published workbook workflow before starting a grade batch.
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm font-semibold text-[#8c3f2f]">
                {error}
              </p>
            ) : null}
            <button
              disabled={
                pending || !catalogPrompts.length || !workbookPrompts.length
              }
              className="cta-button cta-button--dark mt-6 inline-flex w-full items-center justify-center gap-2 disabled:opacity-55"
            >
              {pending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : null}
              {pending ? "Queueing…" : "Generate catalog plan"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
