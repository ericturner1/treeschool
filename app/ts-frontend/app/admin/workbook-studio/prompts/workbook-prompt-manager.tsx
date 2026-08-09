"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkbookStudioSummary } from "../../../../lib/workbook-studio/server";
import { saveWorkbookStudioPromptAction } from "../actions";

export function WorkbookPromptManager({
  prompts,
}: {
  prompts: WorkbookStudioSummary["prompts"];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(prompts[0]?.id ?? "new");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedId),
    [prompts, selectedId],
  );
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-[22px] border border-[#d8c8ae] bg-[#fffaf2] p-4">
        <button
          type="button"
          onClick={() => setSelectedId("new")}
          className={`w-full rounded-[12px] px-3 py-2 text-left text-sm font-bold ${selectedId === "new" ? "bg-[#dfead4] text-[#486a38]" : "bg-white"}`}
        >
          + New prompt
        </button>
        <div className="mt-3 grid gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => setSelectedId(prompt.id)}
              className={`rounded-[12px] px-3 py-2 text-left ${selectedId === prompt.id ? "bg-[#dfead4]" : "bg-white"}`}
            >
              <span className="block text-sm font-bold">{prompt.name}</span>
              <span className="text-xs text-ink/48">
                {prompt.kind.replaceAll("_", " ")} · v
                {prompt.versionNumber ?? "—"}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <form
        key={selectedId}
        className="rounded-[24px] border border-[#d8c8ae] bg-[#fffaf2] p-5 sm:p-7"
        action={(formData) => {
          setError("");
          setNotice("");
          startTransition(async () => {
            let configuration: Record<string, unknown> = {};
            try {
              configuration = JSON.parse(
                String(formData.get("configuration") ?? "{}"),
              ) as Record<string, unknown>;
            } catch {
              return setError("Configuration must be valid JSON.");
            }
            const result = await saveWorkbookStudioPromptAction({
              promptId: selected?.id ?? null,
              name: String(formData.get("name") ?? ""),
              description: String(formData.get("description") ?? ""),
              kind: String(formData.get("kind") ?? "workflow"),
              promptText: String(formData.get("promptText") ?? ""),
              configuration,
              source: selected?.sourceJson ?? { source: "workbook_studio" },
              publish: formData.get("publish") === "on",
            });
            if (!result.ok) return setError(result.error);
            setNotice(
              `Saved prompt version ${result.version.versionNumber}${formData.get("publish") === "on" ? " and published it" : " as a draft"}.`,
            );
            router.refresh();
          });
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {selected
                ? `${selected.name} · new version`
                : "Create generation prompt"}
            </h2>
            <p className="mt-1 text-sm text-ink/50">
              Projects pin the exact prompt version they used.
            </p>
          </div>
          {selected ? (
            <span className="rounded-full bg-[#eef4e8] px-3 py-1 text-xs font-bold text-[#52713f]">
              Current v{selected.versionNumber}
            </span>
          ) : null}
        </div>
        {notice ? (
          <p className="mt-5 rounded-[12px] bg-[#edf5e7] px-4 py-3 text-sm text-[#486a38]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-[12px] bg-[#fff0ea] px-4 py-3 text-sm text-[#8c3f2f]">
            {error}
          </p>
        ) : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">
            Name
            <input
              name="name"
              required
              defaultValue={selected?.name ?? "New workbook workflow"}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Kind
            <select
              name="kind"
              defaultValue={selected?.kind ?? "workflow"}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            >
              <option value="workflow">Single-workbook workflow</option>
              <option value="catalog_plan">Grade catalog plan</option>
              <option value="outline">Outline stage</option>
              <option value="lesson_content">Lesson content stage</option>
              <option value="subject_overlay">Subject overlay</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Description
            <textarea
              name="description"
              defaultValue={selected?.description ?? ""}
              className="min-h-20 rounded-[11px] border border-[#d8c8ae] bg-white p-3 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Prompt text
            <textarea
              name="promptText"
              required
              defaultValue={
                selected?.promptText ??
                "Generate a complete, age-appropriate workbook using the requested scope and the active rules."
              }
              className="min-h-[420px] rounded-[11px] border border-[#d8c8ae] bg-white p-4 font-mono text-xs font-normal leading-5"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Workflow configuration (JSON)
            <textarea
              name="configuration"
              defaultValue={JSON.stringify(
                selected?.configurationJson ?? {},
                null,
                2,
              )}
              className="min-h-36 rounded-[11px] border border-[#d8c8ae] bg-white p-4 font-mono text-xs font-normal leading-5"
            />
            <span className="font-normal text-ink/45">
              Use this for pinned stage-prompt and subject-overlay version IDs.
              Plain prompts can keep it as an empty object.
            </span>
          </label>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              name="publish"
              type="checkbox"
              defaultChecked
              className="mt-1"
            />
            <span>
              <strong className="block">Publish this version</strong>
              <span className="text-xs text-ink/48">
                Only published versions appear in the creation wizard.
              </span>
            </span>
          </label>
          <button
            disabled={pending}
            className="cta-button cta-button--dark inline-flex items-center gap-2 disabled:opacity-55"
          >
            {pending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : null}
            {pending ? "Saving…" : "Save version"}
          </button>
        </div>
      </form>
    </div>
  );
}
