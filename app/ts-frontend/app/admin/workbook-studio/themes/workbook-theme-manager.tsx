"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkbookStudioSummary } from "../../../../lib/workbook-studio/server";
import { saveWorkbookStudioThemeAction } from "../actions";

type Theme = WorkbookStudioSummary["themes"][number];

const defaults = {
  name: "New workbook theme",
  description: "",
  colorInk: "#25201B",
  colorEarth: "#8F6544",
  colorLeaf: "#739E56",
  colorLeafDark: "#567B40",
  colorCream: "#FFFAF2",
  colorSand: "#F6EDDC",
  colorCanvas: "#FFFFFF",
  colorCoverAccent: "#2F6690",
  colorCoverAccentSoft: "#E3EEF5",
  headingFontFamily: '"Comic Neue", "Comic Sans MS", cursive',
  bodyFontFamily:
    '"Nunito", "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
  pageMarginTopMm: 16,
  pageMarginRightMm: 14,
  pageMarginBottomMm: 20,
  pageMarginLeftMm: 14,
  firstPageMarginTopMm: 8,
  firstPageMarginRightMm: 7,
  firstPageMarginBottomMm: 10,
  firstPageMarginLeftMm: 7,
  bodyFontSizePt: 13,
  bodyLineHeight: 1.5,
};

const colorFields = [
  ["colorInk", "Ink"],
  ["colorEarth", "Earth"],
  ["colorLeaf", "Leaf"],
  ["colorLeafDark", "Leaf dark"],
  ["colorCream", "Cream"],
  ["colorSand", "Sand"],
  ["colorCanvas", "Canvas"],
  ["colorCoverAccent", "Cover accent"],
  ["colorCoverAccentSoft", "Cover accent soft"],
] as const;

const marginFields = [
  ["pageMarginTopMm", "Page top"],
  ["pageMarginRightMm", "Page right"],
  ["pageMarginBottomMm", "Page bottom"],
  ["pageMarginLeftMm", "Page left"],
  ["firstPageMarginTopMm", "Cover top"],
  ["firstPageMarginRightMm", "Cover right"],
  ["firstPageMarginBottomMm", "Cover bottom"],
  ["firstPageMarginLeftMm", "Cover left"],
] as const;

function valueFor(theme: Theme | undefined, key: keyof typeof defaults) {
  return theme?.[key as keyof Theme] ?? defaults[key];
}

export function WorkbookThemeManager({
  themes,
}: {
  themes: WorkbookStudioSummary["themes"];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(themes[0]?.id ?? "new");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selected = useMemo(
    () => themes.find((theme) => theme.id === selectedId),
    [selectedId, themes],
  );

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-[22px] border border-[#d8c8ae] bg-[#fffaf2] p-4">
        <button
          type="button"
          onClick={() => setSelectedId("new")}
          className={`w-full rounded-[12px] px-3 py-2 text-left text-sm font-bold ${selectedId === "new" ? "bg-[#dfead4] text-[#486a38]" : "bg-white"}`}
        >
          + New theme
        </button>
        <div className="mt-3 grid gap-2">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setSelectedId(theme.id)}
              className={`rounded-[12px] px-3 py-2 text-left ${selectedId === theme.id ? "bg-[#dfead4]" : "bg-white"}`}
            >
              <span className="block text-sm font-bold">{theme.name}</span>
              <span className="text-xs text-ink/48">
                Published v{theme.versionNumber ?? "—"}
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
            const number = (name: string) => Number(formData.get(name));
            const result = await saveWorkbookStudioThemeAction({
              themeId: selected?.id ?? null,
              name: String(formData.get("name") ?? ""),
              description: String(formData.get("description") ?? ""),
              publish: formData.get("publish") === "on",
              tokens: {
                colorInk: String(formData.get("colorInk")),
                colorEarth: String(formData.get("colorEarth")),
                colorLeaf: String(formData.get("colorLeaf")),
                colorLeafDark: String(formData.get("colorLeafDark")),
                colorCream: String(formData.get("colorCream")),
                colorSand: String(formData.get("colorSand")),
                colorCanvas: String(formData.get("colorCanvas")),
                colorCoverAccent: String(formData.get("colorCoverAccent")),
                colorCoverAccentSoft: String(
                  formData.get("colorCoverAccentSoft"),
                ),
                headingFontFamily: String(formData.get("headingFontFamily")),
                bodyFontFamily: String(formData.get("bodyFontFamily")),
                pageSize: "A4",
                pageMarginTopMm: number("pageMarginTopMm"),
                pageMarginRightMm: number("pageMarginRightMm"),
                pageMarginBottomMm: number("pageMarginBottomMm"),
                pageMarginLeftMm: number("pageMarginLeftMm"),
                firstPageMarginTopMm: number("firstPageMarginTopMm"),
                firstPageMarginRightMm: number("firstPageMarginRightMm"),
                firstPageMarginBottomMm: number("firstPageMarginBottomMm"),
                firstPageMarginLeftMm: number("firstPageMarginLeftMm"),
                bodyFontSizePt: number("bodyFontSizePt"),
                bodyLineHeight: number("bodyLineHeight"),
              },
            });
            if (!result.ok) return setError(result.error);
            setNotice(
              `Saved theme version ${result.version.versionNumber}${formData.get("publish") === "on" ? " and published it" : " as a draft"}.`,
            );
            router.refresh();
          });
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {selected ? `${selected.name} · new version` : "Create theme"}
            </h2>
            <p className="mt-1 text-sm text-ink/50">
              Raw CSS is deliberately unavailable in v1.
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
              defaultValue={String(valueFor(selected, "name"))}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold sm:col-span-2">
            Description
            <textarea
              name="description"
              defaultValue={String(valueFor(selected, "description"))}
              className="min-h-20 rounded-[11px] border border-[#d8c8ae] bg-white p-3 font-normal"
            />
          </label>
        </div>
        <h3 className="mt-7 font-semibold">Color tokens</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {colorFields.map(([name, label]) => (
            <label
              key={name}
              className="flex items-center gap-3 rounded-[12px] border border-[#ded0bb] bg-white p-2 text-xs font-bold"
            >
              <input
                type="color"
                name={name}
                defaultValue={String(valueFor(selected, name))}
                className="h-9 w-11 rounded border-0 bg-transparent"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <h3 className="mt-7 font-semibold">Typography</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">
            Heading font
            <select
              name="headingFontFamily"
              defaultValue={String(valueFor(selected, "headingFontFamily"))}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            >
              <option value={'"Comic Neue", "Comic Sans MS", cursive'}>
                Comic Neue
              </option>
              <option value={'"Nunito", "Avenir Next", sans-serif'}>
                Nunito
              </option>
              <option value={'"Noto Sans JP", sans-serif'}>Noto Sans JP</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Body font
            <select
              name="bodyFontFamily"
              defaultValue={String(valueFor(selected, "bodyFontFamily"))}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            >
              <option
                value={
                  '"Nunito", "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif'
                }
              >
                Nunito
              </option>
              <option value={'"Noto Sans JP", "Nunito", sans-serif'}>
                Noto Sans JP
              </option>
              <option value={'"Comic Neue", "Comic Sans MS", cursive'}>
                Comic Neue
              </option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Body size (pt)
            <input
              name="bodyFontSizePt"
              type="number"
              min="8"
              max="24"
              step="0.25"
              defaultValue={Number(valueFor(selected, "bodyFontSizePt"))}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Line height
            <input
              name="bodyLineHeight"
              type="number"
              min="1"
              max="2.5"
              step="0.05"
              defaultValue={Number(valueFor(selected, "bodyLineHeight"))}
              className="rounded-[11px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
        </div>
        <h3 className="mt-7 font-semibold">Fixed A4 page margins (mm)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {marginFields.map(([name, label]) => (
            <label key={name} className="grid gap-1 text-xs font-bold">
              {label}
              <input
                name={name}
                type="number"
                min="0"
                max="60"
                step="0.5"
                defaultValue={Number(valueFor(selected, name))}
                className="rounded-[10px] border border-[#d8c8ae] bg-white px-2 py-2 font-normal"
              />
            </label>
          ))}
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
                Draft versions cannot be assigned to workbooks.
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
