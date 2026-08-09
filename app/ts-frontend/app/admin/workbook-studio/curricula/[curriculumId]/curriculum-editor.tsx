"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  WorkbookCatalogPlan,
  WorkbookStudioCurriculumDetail,
  WorkbookStudioSummary,
} from "../../../../../lib/workbook-studio/server";
import {
  generateWorkbookStudioCurriculumAction,
  publishWorkbookStudioCurriculumAction,
  saveWorkbookStudioCurriculumAction,
} from "../../actions";

function initialPlan(
  detail: WorkbookStudioCurriculumDetail,
): WorkbookCatalogPlan {
  const raw = detail.currentRevision?.planJson;
  return {
    curriculumName:
      typeof raw?.curriculumName === "string"
        ? raw.curriculumName
        : detail.curriculum.name,
    workbooks: Array.isArray(raw?.workbooks)
      ? (raw.workbooks as WorkbookCatalogPlan["workbooks"])
      : [],
  };
}

function newPlanKey() {
  return `workbook-${crypto.randomUUID().slice(0, 8)}`;
}

export function CurriculumEditor({
  detail,
  prompts,
}: {
  detail: WorkbookStudioCurriculumDetail;
  prompts: WorkbookStudioSummary["prompts"];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(() => structuredClone(initialPlan(detail)));
  const storedPrompt =
    typeof detail.currentRevision?.planJson.workbookPromptVersionId === "string"
      ? detail.currentRevision.planJson.workbookPromptVersionId
      : "";
  const [promptVersionId, setPromptVersionId] = useState(storedPrompt);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const workflows = prompts.filter(
    (prompt) => prompt.kind === "workflow" && prompt.publishedVersionId,
  );
  const generatedKeys = useMemo(
    () =>
      new Set(
        detail.projects
          .map((project) => project.catalogPlanKey)
          .filter(Boolean),
      ),
    [detail.projects],
  );

  function mutate(mutator: (draft: WorkbookCatalogPlan) => void) {
    setPlan((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setDirty(true);
    setNotice("");
  }

  function save() {
    setError("");
    startTransition(async () => {
      const result = await saveWorkbookStudioCurriculumAction({
        curriculumId: detail.curriculum.id,
        plan,
        workbookPromptVersionId: promptVersionId || null,
      });
      if (!result.ok) return setError(result.error);
      setDirty(false);
      setNotice(
        `Saved immutable curriculum revision ${result.revision.revisionNumber}.`,
      );
      router.refresh();
    });
  }

  function publish() {
    if (dirty) return setError("Save the curriculum before publishing it.");
    setError("");
    startTransition(async () => {
      const result = await publishWorkbookStudioCurriculumAction(
        detail.curriculum.id,
      );
      if (!result.ok) return setError(result.error);
      setNotice("Curriculum plan published.");
      router.refresh();
    });
  }

  function generate() {
    if (dirty)
      return setError("Save the curriculum before generating its workbooks.");
    if (!promptVersionId)
      return setError("Choose a published single-workbook workflow.");
    setError("");
    startTransition(async () => {
      const result = await generateWorkbookStudioCurriculumAction({
        curriculumId: detail.curriculum.id,
        workbookPromptVersionId: promptVersionId,
      });
      if (!result.ok) return setError(result.error);
      setNotice(
        `${result.createdProjectIds.length} workbook generation run${result.createdProjectIds.length === 1 ? "" : "s"} queued. ${result.existingProjectIds.length ? `${result.existingProjectIds.length} existing workbook keys were left unchanged.` : ""}`,
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Planned workbooks</h2>
            <p className="mt-1 text-sm text-ink/48">
              One row per subject or locale variant. Stable keys make fan-out
              safe to retry.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              mutate((draft) =>
                draft.workbooks.push({
                  stableKey: newPlanKey(),
                  title: "New workbook",
                  subjectKey: "subject",
                  subjectLabel: "Subject",
                  domains: ["Domain"],
                  languageCode: detail.curriculum.languageCode,
                  localeCode: null,
                  layoutProfile: "standard",
                  scriptProfile:
                    detail.curriculum.languageCode === "ja"
                      ? "japanese"
                      : "latin",
                }),
              )
            }
            className="cta-button cta-button--outline cta-button--small"
          >
            + Workbook
          </button>
        </div>
        {notice ? (
          <p className="mt-4 rounded-[12px] bg-[#edf5e7] px-4 py-3 text-sm text-[#486a38]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm text-[#8c3f2f]">
            {error}
          </p>
        ) : null}
        <div className="mt-5 grid gap-4">
          {plan.workbooks.map((workbook, index) => {
            const generated = generatedKeys.has(workbook.stableKey);
            return (
              <div
                key={workbook.stableKey}
                className="rounded-[20px] border border-[#d8c8ae] bg-[#fffaf2] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] text-ink/42">
                      {workbook.stableKey}
                    </p>
                    {generated ? (
                      <span className="mt-1 inline-block rounded-full bg-[#eef4e8] px-2 py-0.5 text-[10px] font-bold text-[#52713f]">
                        Project exists
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={generated}
                    title={
                      generated
                        ? "Archive the generated project separately before removing this plan entry."
                        : undefined
                    }
                    onClick={() =>
                      mutate((draft) => draft.workbooks.splice(index, 1))
                    }
                    className="text-xs font-bold text-[#8c3f2f] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-bold sm:col-span-2">
                    Title
                    <input
                      value={workbook.title}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].title = event.target.value;
                        })
                      }
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Subject label
                    <input
                      value={workbook.subjectLabel}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].subjectLabel =
                            event.target.value;
                        })
                      }
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Subject key
                    <input
                      value={workbook.subjectKey}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].subjectKey =
                            event.target.value;
                        })
                      }
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold sm:col-span-2">
                    Domains
                    <input
                      value={workbook.domains.join(", ")}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].domains = event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean);
                        })
                      }
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Language
                    <input
                      value={workbook.languageCode}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].languageCode =
                            event.target.value;
                        })
                      }
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Locale variant
                    <input
                      value={workbook.localeCode ?? ""}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].localeCode =
                            event.target.value || null;
                        })
                      }
                      placeholder="None"
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Layout
                    <select
                      value={workbook.layoutProfile}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].layoutProfile = event.target
                            .value as "standard" | "reader";
                        })
                      }
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    >
                      <option value="standard">Standard</option>
                      <option value="reader">Reader</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Script
                    <select
                      value={workbook.scriptProfile}
                      onChange={(event) =>
                        mutate((draft) => {
                          draft.workbooks[index].scriptProfile = event.target
                            .value as "latin" | "japanese";
                        })
                      }
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    >
                      <option value="latin">Latin</option>
                      <option value="japanese">Japanese / CJK</option>
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
          {!plan.workbooks.length ? (
            <div className="rounded-[20px] border border-dashed border-[#bca98a] bg-white/45 px-6 py-12 text-center text-sm text-ink/50">
              The plan has no workbooks yet. Add one manually, or wait for the
              catalog-planning job to finish.
            </div>
          ) : null}
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[20px] border border-[#d8c8ae] bg-[#fffaf2] p-4">
          <h2 className="font-semibold">Workflow</h2>
          <label className="mt-3 grid gap-1 text-xs font-bold">
            Single-workbook prompt
            <select
              value={promptVersionId}
              onChange={(event) => {
                setPromptVersionId(event.target.value);
                setDirty(true);
              }}
              className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
            >
              <option value="">Choose workflow</option>
              {workflows.map((prompt) => (
                <option key={prompt.id} value={prompt.publishedVersionId!}>
                  {prompt.name} · v{prompt.versionNumber}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty || !plan.workbooks.length}
              className="cta-button cta-button--dark cta-button--small inline-flex items-center justify-center gap-2 disabled:opacity-45"
            >
              {pending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : null}
              Save revision
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={pending || dirty || !detail.currentRevision}
              className="cta-button cta-button--outline cta-button--small disabled:opacity-45"
            >
              Publish plan
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={
                pending || dirty || !plan.workbooks.length || !promptVersionId
              }
              className="cta-button cta-button--light cta-button--small disabled:opacity-45"
            >
              Generate workbooks
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-ink/45">
            Generation skips stable keys that already have projects. It never
            overwrites an existing workbook.
          </p>
        </div>
        <div className="rounded-[20px] border border-[#d8c8ae] bg-white/70 p-4">
          <h2 className="font-semibold">Generated projects</h2>
          <div className="mt-3 grid gap-2">
            {detail.projects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/workbook-studio/${project.id}`}
                className="rounded-[10px] bg-[#f6eddd] px-3 py-2 text-sm"
              >
                <strong className="block">{project.title}</strong>
                <span className="text-xs text-ink/48">{project.status}</span>
              </Link>
            ))}
            {!detail.projects.length ? (
              <p className="text-xs text-ink/45">No workbook projects yet.</p>
            ) : null}
          </div>
        </div>
        <div className="rounded-[20px] border border-[#d8c8ae] bg-white/70 p-4">
          <h2 className="font-semibold">History</h2>
          <p className="mt-2 text-xs text-ink/48">
            Current revision {detail.currentRevision?.revisionNumber ?? "—"} ·
            Published {detail.publishedRevision?.revisionNumber ?? "—"}
          </p>
        </div>
      </aside>
    </div>
  );
}
