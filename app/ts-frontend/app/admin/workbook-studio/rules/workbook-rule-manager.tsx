"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkbookStudioSummary } from "../../../../lib/workbook-studio/server";
import { saveWorkbookStudioRuleAction } from "../actions";

export function WorkbookRuleManager({
  rules,
}: {
  rules: WorkbookStudioSummary["rules"];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(rules[0]?.id ?? "new");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = useMemo(
    () => rules.find((rule) => rule.id === selectedId),
    [rules, selectedId],
  );

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-[22px] border border-[#d8c8ae] bg-[#fffaf2] p-4">
        <button
          type="button"
          onClick={() => setSelectedId("new")}
          className={`w-full rounded-[12px] px-3 py-2 text-left text-sm font-bold ${selectedId === "new" ? "bg-[#dfead4] text-[#486a38]" : "bg-white"}`}
        >
          + New rule
        </button>
        <div className="mt-3 grid gap-2">
          {rules.map((rule) => (
            <button
              key={rule.id}
              type="button"
              onClick={() => setSelectedId(rule.id)}
              className={`rounded-[12px] px-3 py-2 text-left ${selectedId === rule.id ? "bg-[#dfead4]" : "bg-white"}`}
            >
              <span className="block text-sm font-bold">{rule.name}</span>
              <span className="text-xs text-ink/48">
                {rule.enforcement?.replaceAll("_", " ")} · v
                {rule.versionNumber ?? "—"}
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
            let parameters: Record<string, unknown> = {};
            try {
              parameters = JSON.parse(
                String(formData.get("parameters") ?? "{}"),
              ) as Record<string, unknown>;
            } catch {
              return setError("Parameters must be valid JSON.");
            }
            const nullableNumber = (name: string) => {
              const raw = String(formData.get(name) ?? "").trim();
              return raw ? Number(raw) : null;
            };
            const nullableText = (name: string) =>
              String(formData.get(name) ?? "").trim() || null;
            const result = await saveWorkbookStudioRuleAction({
              ruleId: selected?.id ?? null,
              name: String(formData.get("name") ?? ""),
              description: String(formData.get("description") ?? ""),
              ruleKind: String(formData.get("ruleKind") ?? "quality"),
              scopeType: String(formData.get("scopeType") ?? "global"),
              subjectKey: nullableText("subjectKey"),
              gradeMin: nullableNumber("gradeMin"),
              gradeMax: nullableNumber("gradeMax"),
              languageCode: nullableText("languageCode"),
              stage: nullableText("stage"),
              enforcement: String(formData.get("enforcement") ?? "prompt"),
              instructionText: nullableText("instructionText"),
              parameters,
              publish: formData.get("publish") === "on",
            });
            if (!result.ok) return setError(result.error);
            setNotice(
              `Saved rule version ${result.version.versionNumber}${formData.get("publish") === "on" ? " and published it" : " as a draft"}.`,
            );
            router.refresh();
          });
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {selected ? `${selected.name} · new version` : "Create rule"}
            </h2>
            <p className="mt-1 text-sm text-ink/50">
              Generation runs pin every applied rule version for auditability.
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
              defaultValue={selected?.name ?? "New quality rule"}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Rule kind
            <input
              name="ruleKind"
              required
              defaultValue={selected?.ruleKind ?? "quality"}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Description
            <textarea
              name="description"
              defaultValue={selected?.description ?? ""}
              className="min-h-20 rounded-[11px] border border-[#d8c8ae] bg-white p-3 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Enforcement
            <select
              name="enforcement"
              defaultValue={selected?.enforcement ?? "prompt"}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            >
              <option value="prompt">Prompt instruction</option>
              <option value="save_validator">Save validator</option>
              <option value="publish_validator">Publish validator</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Scope
            <select
              name="scopeType"
              defaultValue={selected?.scopeType ?? "global"}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            >
              <option value="global">Global</option>
              <option value="subject">Subject</option>
              <option value="grade">Grade range</option>
              <option value="subject_grade">Subject + grade range</option>
              <option value="language">Language</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Subject key (optional)
            <input
              name="subjectKey"
              defaultValue={selected?.subjectKey ?? ""}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
              placeholder="math"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Language (optional)
            <input
              name="languageCode"
              defaultValue={selected?.languageCode ?? ""}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
              placeholder="en"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Minimum grade (optional)
            <input
              name="gradeMin"
              type="number"
              min="-2"
              max="20"
              defaultValue={selected?.gradeMin ?? ""}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Maximum grade (optional)
            <input
              name="gradeMax"
              type="number"
              min="-2"
              max="20"
              defaultValue={selected?.gradeMax ?? ""}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Generation stage (optional)
            <select
              name="stage"
              defaultValue={selected?.stage ?? ""}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            >
              <option value="">Every stage</option>
              <option value="catalog_plan">Catalog plan</option>
              <option value="workbook_brief">Workbook brief</option>
              <option value="outline">Outline</option>
              <option value="lesson_content">Lesson content</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Prompt instruction
            <textarea
              name="instructionText"
              defaultValue={selected?.instructionText ?? ""}
              className="min-h-28 rounded-[11px] border border-[#d8c8ae] bg-white p-3 font-normal"
              placeholder="Required when enforcement is Prompt instruction."
            />
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Parameters (JSON)
            <textarea
              name="parameters"
              defaultValue={JSON.stringify(
                selected?.parametersJson ?? {},
                null,
                2,
              )}
              className="min-h-32 rounded-[11px] border border-[#d8c8ae] bg-white p-4 font-mono text-xs font-normal leading-5"
            />
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
                New generation runs use only the published version.
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
