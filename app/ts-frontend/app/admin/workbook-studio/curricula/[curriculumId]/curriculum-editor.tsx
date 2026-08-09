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
  queueWorkbookGradeLevelGenerationAction,
  saveWorkbookStudioCurriculumAction,
  setWorkbookStudioCourseThemeAction,
} from "../../actions";

type CurriculumEditorProps = {
  detail: WorkbookStudioCurriculumDetail;
  prompts: WorkbookStudioSummary["prompts"];
  academicStandards: WorkbookStudioSummary["academicStandards"];
  curriculumSubjects: WorkbookStudioSummary["curriculumSubjects"];
  themes: WorkbookStudioSummary["themes"];
};

function initialPlan(detail: WorkbookStudioCurriculumDetail): WorkbookCatalogPlan {
  const raw = detail.currentRevision?.planJson;
  if (Array.isArray(raw?.courses)) {
    return {
      schemaVersion: 2,
      curriculumName:
        typeof raw.curriculumName === "string"
          ? raw.curriculumName
          : detail.curriculum.name,
      courses: raw.courses as WorkbookCatalogPlan["courses"],
    };
  }
  return {
    schemaVersion: 2,
    curriculumName: detail.curriculum.name,
    courses: [],
  };
}

function newPlanKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function CurriculumEditor({
  detail,
  prompts,
  academicStandards,
  curriculumSubjects,
  themes,
}: CurriculumEditorProps) {
  const router = useRouter();
  const [plan, setPlan] = useState(() => structuredClone(initialPlan(detail)));
  const storedPrompt =
    typeof detail.currentRevision?.planJson.workbookPromptVersionId === "string"
      ? detail.currentRevision.planJson.workbookPromptVersionId
      : "";
  const [promptVersionId, setPromptVersionId] = useState(storedPrompt);
  const [catalogPromptVersionId, setCatalogPromptVersionId] = useState("");
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const workflows = prompts.filter(
    (prompt) => prompt.kind === "workflow" && prompt.publishedVersionId,
  );
  const catalogPrompts = prompts.filter(
    (prompt) => prompt.kind === "catalog_plan" && prompt.publishedVersionId,
  );
  const publishedThemes = themes.filter((theme) => theme.publishedVersionId);
  const generatedKeys = useMemo(
    () => new Set(detail.projects.map((project) => project.catalogPlanKey).filter(Boolean)),
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

  function subjectsFor(course: WorkbookCatalogPlan["courses"][number]) {
    const standardKey =
      course.academicStandardOverrideKey ??
      detail.curriculum.academicStandardKey;
    return curriculumSubjects.filter(
      (subject) => subject.academicStandardKey === standardKey,
    );
  }

  function addCourse() {
    const used = new Set(plan.courses.map((course) => course.curriculumSubjectId));
    const subject = curriculumSubjects.find(
      (candidate) =>
        candidate.academicStandardKey === detail.curriculum.academicStandardKey &&
        !used.has(candidate.id),
    );
    if (!subject) {
      setError("No unused subjects are available for this academic standard.");
      return;
    }
    mutate((draft) => {
      draft.courses.push({
        stableKey: subject.key,
        curriculumSubjectId: subject.id,
        subjectKey: subject.key,
        subjectLabel: subject.label,
        status: "new",
        academicStandardOverrideKey: null,
        standardCode: null,
        standardLabel: null,
        themeOverrideVersionId: null,
        boundaryNotes: "",
        coverageNotes: "",
        pipelineKey: "general",
        workbooks: [],
      });
    });
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
      setNotice(`Saved immutable curriculum revision ${result.revision.revisionNumber}.`);
      router.refresh();
    });
  }

  function publish() {
    if (dirty) return setError("Save the curriculum before publishing it.");
    setError("");
    startTransition(async () => {
      const result = await publishWorkbookStudioCurriculumAction(detail.curriculum.id);
      if (!result.ok) return setError(result.error);
      setNotice("Curriculum plan published.");
      router.refresh();
    });
  }

  function generate() {
    if (dirty) return setError("Save the curriculum before generating its workbooks.");
    if (!promptVersionId) return setError("Choose a published single-workbook workflow.");
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

  function generatePlan() {
    if (dirty) return setError("Save or discard your curriculum edits before generating a new plan.");
    if (!catalogPromptVersionId) return setError("Choose a published catalog-planning prompt.");
    if (!promptVersionId) return setError("Choose a published single-workbook workflow.");
    if (!window.confirm("Claude will create a new curriculum revision with courses and their workbook variants. Continue?")) return;
    setError("");
    startTransition(async () => {
      const result = await queueWorkbookGradeLevelGenerationAction({
        curriculumId: detail.curriculum.id,
        catalogPromptVersionId,
        workbookPromptVersionId: promptVersionId,
      });
      if (!result.ok) return setError(result.error);
      setNotice("AI curriculum planning queued. The current revision remains active until the new one is ready.");
      router.refresh();
    });
  }

  function changeCourseTheme(courseStableKey: string, themeVersionId: string | null) {
    const savedCourse = detail.courses.find((course) => course.stableKey === courseStableKey);
    if (!savedCourse) return setError("Save this new course before choosing its theme.");
    setError("");
    startTransition(async () => {
      const result = await setWorkbookStudioCourseThemeAction(
        detail.curriculum.id,
        savedCourse.id,
        themeVersionId,
      );
      if (!result.ok) return setError(result.error);
      setNotice(
        result.affectedProjects
          ? `Course theme changed. ${result.affectedProjects} workbook project${result.affectedProjects === 1 ? "" : "s"} will use it; released workbooks were queued as new editions.`
          : "Course theme changed.",
      );
      router.refresh();
    });
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Courses</h2>
            <p className="mt-1 text-sm text-ink/48">
              A curriculum defines required courses. Each course can own one or more locale, level, or split-series workbooks.
            </p>
          </div>
          <button type="button" onClick={addCourse} className="cta-button cta-button--outline cta-button--small">
            + Course
          </button>
        </div>
        {notice ? <p className="mt-4 rounded-[12px] bg-[#edf5e7] px-4 py-3 text-sm text-[#486a38]">{notice}</p> : null}
        {error ? <p className="mt-4 rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm text-[#8c3f2f]">{error}</p> : null}
        <div className="mt-5 grid gap-5">
          {plan.courses.map((course, courseIndex) => {
            const savedCourse = detail.courses.find((candidate) => candidate.stableKey === course.stableKey);
            const courseSubjects = subjectsFor(course);
            return (
              <article key={course.stableKey} className="rounded-[22px] border border-[#cdbb9f] bg-[#fffaf2] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] text-ink/42">{course.stableKey}</p>
                    <h3 className="mt-1 text-xl font-semibold">{course.subjectLabel}</h3>
                  </div>
                  <button
                    type="button"
                    disabled={course.workbooks.some((workbook) => generatedKeys.has(workbook.stableKey))}
                    onClick={() => mutate((draft) => draft.courses.splice(courseIndex, 1))}
                    className="text-xs font-bold text-[#8c3f2f] disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    Remove course
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-bold">
                    Status from prior grade
                    <select
                      value={course.status}
                      onChange={(event) => mutate((draft) => { draft.courses[courseIndex].status = event.target.value as typeof course.status; })}
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    >
                      <option value="inherited">Inherited</option>
                      <option value="modified">Modified</option>
                      <option value="new">New</option>
                      <option value="retired">Retired</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Academic-system override
                    <select
                      value={course.academicStandardOverrideKey ?? ""}
                      onChange={(event) => mutate((draft) => {
                        const current = draft.courses[courseIndex];
                        current.academicStandardOverrideKey = event.target.value || null;
                        const nextStandard = current.academicStandardOverrideKey ?? detail.curriculum.academicStandardKey;
                        const nextSubject = curriculumSubjects.find((subject) => subject.academicStandardKey === nextStandard);
                        if (nextSubject) {
                          current.curriculumSubjectId = nextSubject.id;
                          current.subjectKey = nextSubject.key;
                          current.subjectLabel = nextSubject.label;
                          current.stableKey = nextSubject.key;
                        }
                      })}
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    >
                      <option value="">Inherit {detail.curriculum.academicStandardKey.toUpperCase()}</option>
                      {academicStandards.filter((standard) => standard.key !== detail.curriculum.academicStandardKey).map((standard) => (
                        <option key={standard.key} value={standard.key}>{standard.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold sm:col-span-2">
                    Subject
                    <select
                      value={course.curriculumSubjectId ?? ""}
                      onChange={(event) => mutate((draft) => {
                        const subject = curriculumSubjects.find((candidate) => candidate.id === event.target.value);
                        if (!subject) return;
                        const current = draft.courses[courseIndex];
                        current.curriculumSubjectId = subject.id;
                        current.subjectKey = subject.key;
                        current.subjectLabel = subject.label;
                        current.stableKey = subject.key;
                      })}
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
                    >
                      {courseSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Framework code
                    <input value={course.standardCode ?? ""} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].standardCode = event.target.value || null; })} placeholder="CCSS or NGSS" className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Framework name
                    <input value={course.standardLabel ?? ""} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].standardLabel = event.target.value || null; })} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold sm:col-span-2">
                    Boundary notes
                    <textarea value={course.boundaryNotes} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].boundaryNotes = event.target.value; })} rows={2} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold sm:col-span-2">
                    Standards coverage
                    <textarea value={course.coverageNotes} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].coverageNotes = event.target.value; })} rows={2} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Generation pipeline
                    <input value={course.pipelineKey ?? ""} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].pipelineKey = event.target.value || null; })} placeholder="general" className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Course theme
                    <select
                      value={savedCourse?.themeOverrideVersionId ?? ""}
                      disabled={!savedCourse || pending || dirty}
                      onChange={(event) => changeCourseTheme(course.stableKey, event.target.value || null)}
                      className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal disabled:opacity-50"
                    >
                      <option value="">Inherit curriculum theme</option>
                      {publishedThemes.map((theme) => <option key={theme.id} value={theme.publishedVersionId!}>{theme.name} · v{theme.versionNumber}</option>)}
                    </select>
                  </label>
                </div>

                <div className="mt-5 border-t border-[#e1d2bb] pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">Workbook variants</h4>
                      <p className="text-xs text-ink/45">Locale editions, reader levels, and split-series books live here.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => mutate((draft) => draft.courses[courseIndex].workbooks.push({
                        stableKey: newPlanKey(course.subjectKey),
                        title: `New ${course.subjectLabel} workbook`,
                        domains: ["Domain"],
                        languageCode: detail.curriculum.languageCode,
                        localeCode: null,
                        layoutProfile: "standard",
                        scriptProfile: course.academicStandardOverrideKey === "japan" ? "japanese" : "latin",
                      }))}
                      className="cta-button cta-button--outline cta-button--small"
                    >
                      + Workbook
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {course.workbooks.map((workbook, workbookIndex) => {
                      const generated = generatedKeys.has(workbook.stableKey);
                      return (
                        <div key={workbook.stableKey} className="rounded-[16px] border border-[#dfcfb5] bg-white/75 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-mono text-[10px] text-ink/42">{workbook.stableKey}</p>
                              {generated ? <span className="text-[10px] font-bold text-[#52713f]">Project exists</span> : null}
                            </div>
                            <button type="button" disabled={generated} onClick={() => mutate((draft) => draft.courses[courseIndex].workbooks.splice(workbookIndex, 1))} className="text-xs font-bold text-[#8c3f2f] disabled:opacity-35">Remove</button>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 text-xs font-bold sm:col-span-2">Title<input value={workbook.title} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].workbooks[workbookIndex].title = event.target.value; })} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" /></label>
                            <label className="grid gap-1 text-xs font-bold sm:col-span-2">Domains<input value={workbook.domains.join(", ")} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].workbooks[workbookIndex].domains = event.target.value.split(",").map((value) => value.trim()).filter(Boolean); })} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" /></label>
                            <label className="grid gap-1 text-xs font-bold">Language<input value={workbook.languageCode} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].workbooks[workbookIndex].languageCode = event.target.value; })} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" /></label>
                            <label className="grid gap-1 text-xs font-bold">Locale<input value={workbook.localeCode ?? ""} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].workbooks[workbookIndex].localeCode = event.target.value || null; })} placeholder="None" className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal" /></label>
                            <label className="grid gap-1 text-xs font-bold">Layout<select value={workbook.layoutProfile} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].workbooks[workbookIndex].layoutProfile = event.target.value as "standard" | "reader"; })} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"><option value="standard">Standard</option><option value="reader">Reader</option></select></label>
                            <label className="grid gap-1 text-xs font-bold">Script<select value={workbook.scriptProfile} onChange={(event) => mutate((draft) => { draft.courses[courseIndex].workbooks[workbookIndex].scriptProfile = event.target.value as "latin" | "japanese"; })} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"><option value="latin">Latin</option><option value="japanese">Japanese / CJK</option></select></label>
                          </div>
                        </div>
                      );
                    })}
                    {!course.workbooks.length ? <p className="rounded-[12px] border border-dashed border-[#cdbb9f] px-4 py-5 text-center text-xs text-ink/45">No new workbook is planned for this course. This is valid for inherited or retired courses.</p> : null}
                  </div>
                </div>
              </article>
            );
          })}
          {!plan.courses.length ? <div className="rounded-[20px] border border-dashed border-[#bca98a] bg-white/45 px-6 py-12 text-center text-sm text-ink/50">Add the courses required by this grade, or generate the course catalog with AI.</div> : null}
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[20px] border border-[#d8c8ae] bg-[#fffaf2] p-4">
          <h2 className="font-semibold">Workflow</h2>
          <label className="mt-3 grid gap-1 text-xs font-bold">Catalog-planning prompt<select value={catalogPromptVersionId} onChange={(event) => setCatalogPromptVersionId(event.target.value)} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"><option value="">Choose catalog planner</option>{catalogPrompts.map((prompt) => <option key={prompt.id} value={prompt.publishedVersionId!}>{prompt.name} · v{prompt.versionNumber}</option>)}</select></label>
          <label className="mt-3 grid gap-1 text-xs font-bold">Single-workbook prompt<select value={promptVersionId} onChange={(event) => setPromptVersionId(event.target.value)} className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"><option value="">Choose workflow</option>{workflows.map((prompt) => <option key={prompt.id} value={prompt.publishedVersionId!}>{prompt.name} · v{prompt.versionNumber}</option>)}</select></label>
          <div className="mt-4 grid gap-2">
            <button type="button" onClick={generatePlan} disabled={pending || dirty || !catalogPromptVersionId || !promptVersionId} className="cta-button cta-button--light cta-button--small disabled:opacity-45">Generate new plan with AI</button>
            <button type="button" onClick={save} disabled={pending || !dirty || !plan.courses.length} className="cta-button cta-button--dark cta-button--small inline-flex items-center justify-center gap-2 disabled:opacity-45">{pending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" /> : null}Save revision</button>
            <button type="button" onClick={publish} disabled={pending || dirty || !detail.currentRevision || !plan.courses.length} className="cta-button cta-button--outline cta-button--small disabled:opacity-45">Publish plan</button>
            <button type="button" onClick={generate} disabled={pending || dirty || !plan.courses.some((course) => course.status !== "retired" && course.workbooks.length) || !promptVersionId} className="cta-button cta-button--light cta-button--small disabled:opacity-45">Generate workbooks</button>
          </div>
          <p className="mt-3 text-xs leading-5 text-ink/45">Catalog planning creates courses first. Workbook generation then fans out only the workbook variants nested beneath active courses.</p>
        </div>
        <div className="rounded-[20px] border border-[#d8c8ae] bg-white/70 p-4">
          <h2 className="font-semibold">Generated projects</h2>
          <div className="mt-3 grid gap-2">
            {detail.projects.map((project) => <Link key={project.id} href={`/admin/workbook-studio/${project.id}`} className="rounded-[10px] bg-[#f6eddd] px-3 py-2 text-sm"><strong className="block">{project.title}</strong><span className="text-xs text-ink/48">{project.subjectLabel} · {project.status}</span></Link>)}
            {!detail.projects.length ? <p className="text-xs text-ink/45">No workbook projects yet.</p> : null}
          </div>
        </div>
        <div className="rounded-[20px] border border-[#d8c8ae] bg-white/70 p-4">
          <h2 className="font-semibold">History</h2>
          <p className="mt-2 text-xs text-ink/48">Current revision {detail.currentRevision?.revisionNumber ?? "—"} · Published {detail.publishedRevision?.revisionNumber ?? "—"}</p>
        </div>
      </aside>
    </div>
  );
}
