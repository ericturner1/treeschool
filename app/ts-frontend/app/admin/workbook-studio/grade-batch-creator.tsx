"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkbookStudioSummary } from "../../../lib/workbook-studio/server";
import { generateWorkbookStudioCurriculumAction } from "./actions";

export function GradeBatchCreator({
  curricula,
  prompts,
}: {
  curricula: WorkbookStudioSummary["curricula"];
  prompts: WorkbookStudioSummary["prompts"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
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
              const curriculumId = String(
                formData.get("curriculumId") ?? "",
              );
              startTransition(async () => {
                const result = await generateWorkbookStudioCurriculumAction({
                  curriculumId,
                  workbookPromptVersionId: String(
                    formData.get("workbookPromptVersionId") ?? "",
                  ),
                });
                if (!result.ok) return setError(result.error);
                setOpen(false);
                router.push(
                  `/admin/workbook-studio/curricula/${curriculumId}`,
                );
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
              Choose an existing curriculum and generate the workbooks in its
              current saved plan. Grade, academic standard, language, and
              theme come from the curriculum automatically.
            </p>
            <div className="mt-6 grid gap-4">
              <label className="grid gap-1.5 text-sm font-bold">
                Curriculum
                <select
                  name="curriculumId"
                  required
                  className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                >
                  <option value="">Choose a curriculum</option>
                  {curricula.map((curriculum) => (
                    <option key={curriculum.id} value={curriculum.id}>
                      {curriculum.name} · Grade {curriculum.gradeLevel} ·{" "}
                      {curriculum.languageCode.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
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
            </div>
            {!curricula.length ? (
              <p className="mt-4 rounded-[12px] bg-[#fff0cf] px-4 py-3 text-sm text-[#76571f]">
                Create or import a curriculum before generating a grade.
              </p>
            ) : null}
            {!workbookPrompts.length ? (
              <p className="mt-4 rounded-[12px] bg-[#fff0cf] px-4 py-3 text-sm text-[#76571f]">
                Import or create a published workbook workflow before starting
                grade generation.
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm font-semibold text-[#8c3f2f]">
                {error}
              </p>
            ) : null}
            <button
              disabled={
                pending || !curricula.length || !workbookPrompts.length
              }
              className="cta-button cta-button--dark mt-6 inline-flex w-full items-center justify-center gap-2 disabled:opacity-55"
            >
              {pending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : null}
              {pending ? "Queueing…" : "Generate planned workbooks"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
