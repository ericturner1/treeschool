"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkbookStudioProjectAction } from "./actions";

type Choice = {
  id: string;
  name: string;
  gradeLevel?: number;
  publishedVersionId?: string | null;
  description?: string;
  kind?: string;
};

export function StudioProjectCreator({
  curricula,
  prompts,
}: {
  curricula: Choice[];
  prompts: Choice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"manual" | "generate">("manual");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const workflowPrompts = prompts.filter(
    (prompt) => prompt.kind === "workflow" && prompt.publishedVersionId,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cta-button cta-button--dark"
      >
        New workbook
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#25201b]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-workbook-title"
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-[#d8c8ae] bg-[#fffaf2] p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#567b40]">
                  Step {step} of 2
                </p>
                <h2
                  id="new-workbook-title"
                  className="mt-1 text-3xl font-semibold tracking-[-0.04em]"
                >
                  Create a workbook
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

            {step === 1 ? (
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("manual");
                    setStep(2);
                  }}
                  className="rounded-[20px] border-2 border-[#a9c194] bg-[#f3f8ed] p-5 text-left hover:border-[#638b48]"
                >
                  <span className="text-lg font-bold">Design manually</span>
                  <span className="mt-2 block text-sm leading-6 text-ink/60">
                    Start with one editable chapter and lesson, then build it in
                    the no-code editor.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("generate");
                    setStep(2);
                  }}
                  className="rounded-[20px] border-2 border-[#d2b887] bg-[#fff7e6] p-5 text-left hover:border-[#9a7440]"
                >
                  <span className="text-lg font-bold">
                    Generate from a prompt
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-ink/60">
                    Choose a reusable, versioned workbook-generation prompt and
                    queue the authoring workflow.
                  </span>
                </button>
              </div>
            ) : (
              <form
                className="mt-7 grid gap-4"
                action={(formData) => {
                  setError("");
                  startTransition(async () => {
                    const subjectLabel = String(
                      formData.get("subjectLabel") ?? "",
                    ).trim();
                    const result = await createWorkbookStudioProjectAction({
                      curriculumId:
                        String(formData.get("curriculumId") ?? "") || null,
                      title: String(formData.get("title") ?? ""),
                      subjectKey: subjectLabel,
                      subjectLabel,
                      gradeMin: Number(formData.get("gradeMin") ?? 1),
                      gradeMax: Number(formData.get("gradeMax") ?? 1),
                      languageCode: String(
                        formData.get("languageCode") ?? "en",
                      ),
                      localeCode: null,
                      layoutProfile: String(
                        formData.get("layoutProfile") ?? "standard",
                      ),
                      scriptProfile: String(
                        formData.get("scriptProfile") ?? "latin",
                      ),
                      authoringMode: mode,
                      generationPromptVersionId:
                        mode === "generate"
                          ? String(
                              formData.get("generationPromptVersionId") ?? "",
                            ) || null
                          : null,
                    });
                    if (!result.ok) return setError(result.error);
                    router.push(`/admin/workbook-studio/${result.projectId}`);
                    router.refresh();
                  });
                }}
              >
                <label className="grid gap-1.5 text-sm font-bold">
                  Workbook title
                  <input
                    name="title"
                    required
                    className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                    placeholder="Grade 2 Math: Addition and Subtraction"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-bold">
                    Subject
                    <input
                      name="subjectLabel"
                      required
                      className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                      placeholder="Math"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold">
                    Curriculum
                    <select
                      name="curriculumId"
                      className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                    >
                      <option value="">Standalone workbook</option>
                      {curricula.map((curriculum) => (
                        <option key={curriculum.id} value={curriculum.id}>
                          {curriculum.name}
                          {curriculum.gradeLevel == null
                            ? ""
                            : ` · Grade ${curriculum.gradeLevel}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold">
                    Starting grade
                    <input
                      name="gradeMin"
                      type="number"
                      min="0"
                      max="20"
                      defaultValue="1"
                      required
                      className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold">
                    Ending grade
                    <input
                      name="gradeMax"
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
                    Layout
                    <select
                      name="layoutProfile"
                      className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                    >
                      <option value="standard">Standard workbook</option>
                      <option value="reader">Leveled reader</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold">
                    Script profile
                    <select
                      name="scriptProfile"
                      className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                    >
                      <option value="latin">Latin</option>
                      <option value="japanese">Japanese / CJK</option>
                    </select>
                  </label>
                  {mode === "generate" ? (
                    <label className="grid gap-1.5 text-sm font-bold">
                      Generation prompt
                      <select
                        name="generationPromptVersionId"
                        required
                        className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
                      >
                        <option value="">Choose a published prompt</option>
                        {workflowPrompts.map((prompt) => (
                          <option
                            key={prompt.id}
                            value={prompt.publishedVersionId!}
                          >
                            {prompt.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                {mode === "generate" && !workflowPrompts.length ? (
                  <p className="rounded-[12px] bg-[#fff0cf] px-4 py-3 text-sm text-[#76571f]">
                    No published generation prompts exist yet. Import or create
                    one before using generation.
                  </p>
                ) : null}
                {error ? (
                  <p className="rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm font-semibold text-[#8c3f2f]">
                    {error}
                  </p>
                ) : null}
                <div className="mt-2 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="cta-button cta-button--outline"
                  >
                    Back
                  </button>
                  <button
                    disabled={pending}
                    className="cta-button cta-button--dark inline-flex items-center gap-2 disabled:opacity-55"
                  >
                    {pending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    ) : null}
                    {pending
                      ? "Creating…"
                      : mode === "generate"
                        ? "Create and generate"
                        : "Create workbook"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
