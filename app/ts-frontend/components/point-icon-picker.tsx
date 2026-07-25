"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StudentPointIconKey } from "../lib/points/server";
import { POINT_ICON_OPTIONS, PointIcon } from "./point-icon";

const MAX_CUSTOM_ICON_BYTES = 512 * 1024;
const CUSTOM_ICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type PointIconOption = {
  key: StudentPointIconKey;
  label: string;
};

export function PointIconPicker({
  initialIconKey,
  customIconUrl
}: {
  initialIconKey: StudentPointIconKey;
  customIconUrl: string | null;
}) {
  const initialKey = initialIconKey === "custom" && !customIconUrl ? "star" : initialIconKey;
  const [selectedKey, setSelectedKey] = useState<StudentPointIconKey>(initialKey);
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const visibleCustomIconUrl = previewUrl ?? customIconUrl;
  const options = useMemo<PointIconOption[]>(() => [
    ...POINT_ICON_OPTIONS,
    ...(visibleCustomIconUrl ? [{ key: "custom" as const, label: "My icon" }] : [])
  ], [visibleCustomIconUrl]);
  const selectedOption = options.find((option) => option.key === selectedKey) ?? options[0]!;

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function chooseIcon(key: StudentPointIconKey) {
    setSelectedKey(key);
    setOpen(false);
  }

  function chooseCustomFile(file: File | undefined, input: HTMLInputElement) {
    setUploadError(null);
    if (!file) return;
    if (!CUSTOM_ICON_TYPES.has(file.type)) {
      input.value = "";
      setUploadError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_CUSTOM_ICON_BYTES) {
      input.value = "";
      setUploadError("Custom icons may be up to 512 KB.");
      return;
    }
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setSelectedKey("custom");
  }

  return (
    <div>
      <input type="hidden" name="iconKey" value={selectedKey} />
      <div ref={rootRef} className="relative mt-2 max-w-md">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-16 w-full items-center gap-3 rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-left shadow-[0_3px_0_#ead8ba] outline-none transition hover:border-[#bca176] focus-visible:ring-2 focus-visible:ring-[#789c5f]/45"
        >
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#eef5e4] text-[#638249]">
            <PointIcon iconKey={selectedOption.key} customIconUrl={visibleCustomIconUrl} className="text-[22px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.09em] text-ink/45">Point icon</span>
            <span className="mt-0.5 block font-semibold text-ink">{selectedOption.label}</span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-5 w-5 flex-none text-ink/45 transition ${open ? "rotate-180" : ""}`}>
            <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label="Point icon"
            className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-[16px] border border-[#d8c3a2] bg-white p-1.5 shadow-[0_16px_40px_rgba(70,52,35,0.18)]"
          >
            {options.map((option) => {
              const selected = option.key === selectedKey;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => chooseIcon(option.key)}
                  className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition ${
                    selected ? "bg-[#eef5e4] text-[#4f6f39]" : "text-ink hover:bg-[#faf5ec]"
                  }`}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#638249]">
                    <PointIcon iconKey={option.key} customIconUrl={visibleCustomIconUrl} className="text-xl" />
                  </span>
                  <span className="flex-1 font-semibold">{option.label}</span>
                  {selected ? (
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5">
                      <path d="m4 10 3.5 3.5L16 5.75" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <label className="mt-3 block max-w-md rounded-[16px] border border-dashed border-[#c9b38f] bg-white/65 px-4 py-4">
        <span className="block text-sm font-semibold text-ink">
          {customIconUrl ? "Replace my icon" : "Upload my own icon"}
        </span>
        <span className="mt-1 block text-xs leading-5 text-ink/55">
          PNG, JPEG, or WebP · 512 KB maximum.
        </span>
        <input
          type="file"
          name="customIcon"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => chooseCustomFile(event.currentTarget.files?.[0], event.currentTarget)}
          className="mt-3 block w-full text-sm text-ink/65 file:mr-3 file:rounded-full file:border-0 file:bg-[#e5efd9] file:px-4 file:py-2 file:font-semibold file:text-[#4f6f39]"
        />
        {uploadError ? <span role="alert" className="mt-2 block text-xs font-semibold text-[#9b4435]">{uploadError}</span> : null}
        {previewUrl ? <span className="mt-2 block text-xs font-semibold text-[#4f6f39]">Custom icon selected</span> : null}
      </label>
    </div>
  );
}
