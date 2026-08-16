"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type {
  WorkbookBoxStyle,
  WorkbookContent,
  WorkbookExercise,
  WorkbookExerciseLeaf,
  WorkbookLearnBlock,
  WorkbookLearnBlockLeaf,
  WorkbookStudioProjectDetail,
  WorkbookStudioSummary,
} from "../../../../lib/workbook-studio/server";
import { moveItemAtInsertionPoint } from "../../../../lib/editor-drag";
import {
  queueWorkbookStudioReleaseAction,
  queueWorkbookStudioRenderAction,
  saveWorkbookStudioRevisionAction,
  setWorkbookStudioProjectThemeAction,
} from "../actions";

type ExerciseType = WorkbookExerciseLeaf["type"];
type AddableLearnBlockType = Extract<
  WorkbookLearnBlockLeaf["type"],
  | "paragraph"
  | "image_asset"
  | "qr_code"
  | "sound_asset"
  | "vocabulary_list"
  | "reading_passage"
  | "character_practice"
>;
type WorkbookLayoutColumnCount = 1 | 2 | 3 | 4;
type WorkbookEditorCollection = "learn" | "exercise";
type WorkbookItemLocation =
  | { collection: WorkbookEditorCollection; container: "root"; index: number }
  | {
      collection: WorkbookEditorCollection;
      container: "row";
      rowIndex: number;
      columnIndex: number;
      index: number;
    };
type WorkbookEditorDrag =
  | {
      collection: WorkbookEditorCollection;
      mode: "existing";
      source: WorkbookItemLocation;
      isLayoutRow: boolean;
    }
  | { collection: "learn"; mode: "new"; blockType: AddableLearnBlockType }
  | { collection: "exercise"; mode: "new"; exerciseType: ExerciseType }
  | {
      collection: WorkbookEditorCollection;
      mode: "new_row";
      columnCount: WorkbookLayoutColumnCount;
    };
type WorkbookDropTarget = WorkbookItemLocation;
type WorkbookLessonContent =
  WorkbookContent["chapters"][number]["lessons"][number];
type WorkbookEditorItem = WorkbookLearnBlock | WorkbookExercise;

function WorkbookPaletteIcon({
  type,
  columns,
}: {
  type?: AddableLearnBlockType | ExerciseType;
  columns?: WorkbookLayoutColumnCount;
}) {
  if (columns) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        {Array.from({ length: columns }, (_, index) => {
          const gap = 1.5;
          const width = (18 - gap * (columns - 1)) / columns;
          return (
            <rect
              key={index}
              x={3 + index * (width + gap)}
              y="5"
              width={width}
              height="14"
              rx="1"
            />
          );
        })}
      </svg>
    );
  }

  const commonProps = {
    viewBox: "0 0 24 24",
    className: "h-5 w-5 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (type === "image_asset") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m4 17 4.5-4 3.5 3 3-3 5 4.5" />
      </svg>
    );
  }
  if (type === "qr_code") {
    return (
      <svg {...commonProps}>
        <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
        <rect x="7" y="7" width="3" height="3" />
        <path d="M14 7h3v3h-3zM7 14h3v3H7zM14 14h1v1h2v2h-3z" />
      </svg>
    );
  }
  if (type === "sound_asset") {
    return (
      <svg {...commonProps}>
        <path d="M5 10v4h3l4 3V7l-4 3H5Z" />
        <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" />
      </svg>
    );
  }
  if (type === "vocabulary_list") {
    return (
      <svg {...commonProps}>
        <path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v16H7.5A3.5 3.5 0 0 0 4 21.5v-16ZM20 5.5A3.5 3.5 0 0 0 16.5 4H13v16h3.5a3.5 3.5 0 0 1 3.5 1.5v-16Z" />
      </svg>
    );
  }
  if (type === "reading_passage") {
    return (
      <svg {...commonProps}>
        <path d="M6 3h9l3 3v15H6zM15 3v4h4M9 11h6M9 15h6M9 18h4" />
      </svg>
    );
  }
  if (type === "character_practice") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 3v18M3 12h18M7 8h10M9 8c0 4 1 7 6 9M15 8c0 4-1 7-6 9" />
      </svg>
    );
  }
  if (type === "circle_choice") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </svg>
    );
  }
  if (type === "multiple_choice") {
    return (
      <svg {...commonProps}>
        <rect x="4" y="5" width="3" height="3" rx=".5" />
        <rect x="4" y="11" width="3" height="3" rx=".5" />
        <rect x="4" y="17" width="3" height="3" rx=".5" />
        <path d="M10 6.5h10M10 12.5h10M10 18.5h10" />
      </svg>
    );
  }
  if (type === "fill_in_blank") {
    return (
      <svg {...commonProps}>
        <path d="M3 7h18M3 17h6M15 17h6M10.5 17h3" strokeDasharray="1.5 2" />
      </svg>
    );
  }
  if (type === "matching") {
    return (
      <svg {...commonProps}>
        <circle cx="6" cy="7" r="2" />
        <circle cx="18" cy="7" r="2" />
        <circle cx="6" cy="17" r="2" />
        <circle cx="18" cy="17" r="2" />
        <path d="m8 7 8 10M8 17 16 7" />
      </svg>
    );
  }
  if (type === "write") {
    return (
      <svg {...commonProps}>
        <path d="m4 20 4.2-1 10.7-10.7-3.2-3.2L5 15.8 4 20ZM14.5 6.5l3 3M9 21h11" />
      </svg>
    );
  }
  if (type === "draw_box") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 16 3-3 2.5 2.5L16 11l3 4" />
        <circle cx="9" cy="9" r="1" />
      </svg>
    );
  }
  if (type === "short_answer") {
    return (
      <svg {...commonProps}>
        <path d="M4 6h16M4 12h12M4 18h9M18 15l2 2-4 4-2 .5.5-2z" />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <path d="M5 6h14M5 11h14M5 16h10" />
    </svg>
  );
}

function newStableId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeExercise(
  type: ExerciseType,
  id = newStableId("exercise"),
): WorkbookExerciseLeaf {
  const base = {
    id,
    type,
    prompt: "Write the question here.",
    standardsCodes: [],
  };
  if (type === "circle_choice" || type === "multiple_choice") {
    return {
      ...base,
      options: ["Option A", "Option B", "Option C"],
      correctAnswer: "Option A",
    };
  }
  if (type === "matching") {
    const pairs = [1, 2, 3].map((number) => ({
      id: `${id}-pair-${number}`,
      left: `Item ${number}`,
      right: `Match ${number}`,
    }));
    return {
      ...base,
      leftLabel: "Item",
      rightLabel: "Match",
      pairs,
      rightOrder: pairs.map((pair) => pair.id).reverse(),
    };
  }
  if (type === "write")
    return {
      ...base,
      sampleAnswer: "Example student response.",
      writingLines: 5,
    };
  if (type === "draw_box")
    return {
      ...base,
      sampleAnswer: "Example drawing description.",
      boxHeightMm: 60,
    };
  return {
    ...base,
    correctAnswer: "Answer",
    ...(type === "short_answer" ? { writingLines: 3 } : {}),
  };
}

function makeLearnBlock(type: AddableLearnBlockType): WorkbookLearnBlockLeaf {
  if (type === "qr_code") {
    return {
      type,
      data: "https://www.treehomeschool.com",
      description: "Scan this QR code for more information.",
      sizeMm: 35,
    };
  }
  if (type === "sound_asset") {
    return {
      type,
      assetId: null,
      contentType: null,
      fileName: null,
      sizeBytes: null,
      description: "Listen to this sound.",
      qrSizeMm: 35,
    };
  }
  if (type === "image_asset") {
    return {
      type,
      assetId: null,
      contentType: null,
      pixelWidth: null,
      pixelHeight: null,
      description: "Workbook image",
      altText: "Describe this image",
      widthPercent: 100,
      alignment: "center",
    };
  }
  if (type === "vocabulary_list") {
    return {
      type,
      title: "Vocabulary",
      entries: [{ term: "Word", definition: "Definition" }],
    };
  }
  if (type === "reading_passage") {
    return { type, title: "Passage", paragraphs: ["Write the passage here."] };
  }
  if (type === "character_practice") {
    return { type, character: "字", traceRows: 3 };
  }
  return { type, text: "New learning paragraph." };
}

function makeWorkbookLayoutRow(
  collection: WorkbookEditorCollection,
  columnCount: WorkbookLayoutColumnCount,
): WorkbookLearnBlock | WorkbookExercise {
  const id = newStableId(`${collection}-row`);
  if (collection === "learn") {
    return {
      id,
      type: "layout_row",
      columns: Array.from({ length: columnCount }, (_, index) => ({
        id: `${id}-column-${index + 1}`,
        blocks: [],
      })),
    };
  }
  return {
    id,
    type: "layout_row",
    columns: Array.from({ length: columnCount }, (_, index) => ({
      id: `${id}-column-${index + 1}`,
      exercises: [],
    })),
  };
}

function workbookItemArray(
  lesson: WorkbookLessonContent,
  location: WorkbookItemLocation,
): WorkbookEditorItem[] | null {
  if (location.collection === "learn") {
    if (location.container === "root") {
      return lesson.learnBlocks as WorkbookEditorItem[];
    }
    const row = lesson.learnBlocks[location.rowIndex];
    if (row?.type !== "layout_row") return null;
    const blocks = row.columns[location.columnIndex]?.blocks;
    return blocks ? (blocks as WorkbookEditorItem[]) : null;
  }
  if (location.container === "root") {
    return lesson.exercises as WorkbookEditorItem[];
  }
  const row = lesson.exercises[location.rowIndex];
  if (row?.type !== "layout_row") return null;
  const exercises = row.columns[location.columnIndex]?.exercises;
  return exercises ? (exercises as WorkbookEditorItem[]) : null;
}

function sameWorkbookDropTarget(
  left: WorkbookDropTarget | null,
  right: WorkbookDropTarget,
) {
  if (
    left?.collection !== right.collection ||
    left.container !== right.container ||
    left.index !== right.index
  ) {
    return false;
  }
  if (left.container === "root" && right.container === "root") return true;
  return (
    left.container === "row" &&
    right.container === "row" &&
    left.rowIndex === right.rowIndex &&
    left.columnIndex === right.columnIndex
  );
}

function sameWorkbookContainer(
  left: WorkbookItemLocation,
  right: WorkbookItemLocation,
) {
  if (
    left.collection !== right.collection ||
    left.container !== right.container
  ) {
    return false;
  }
  return left.container === "root"
    ? true
    : right.container === "row" &&
        left.rowIndex === right.rowIndex &&
        left.columnIndex === right.columnIndex;
}

function WorkbookDropZone({
  target,
  drag,
  active,
  onTarget,
  onDrop,
}: {
  target: WorkbookDropTarget;
  drag: WorkbookEditorDrag;
  active: boolean;
  onTarget: (target: WorkbookDropTarget) => void;
  onDrop: (target: WorkbookDropTarget) => void;
}) {
  if (drag.collection !== target.collection) return null;
  if (
    target.container === "row" &&
    (drag.mode === "new_row" ||
      (drag.mode === "existing" && drag.isLayoutRow))
  ) {
    return null;
  }
  return (
    <div
      data-workbook-drop-zone
      className={`my-1 h-4 rounded-full border-2 border-dashed transition ${active ? "border-[var(--studio-leaf-dark)] bg-[var(--studio-sand)]" : "border-[var(--studio-leaf)]/35 bg-white/30"}`}
      onDragEnter={(event) => {
        event.preventDefault();
        onTarget(target);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect =
          drag.mode === "new" || drag.mode === "new_row" ? "copy" : "move";
        onTarget(target);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop(target);
      }}
      aria-hidden="true"
    />
  );
}

type WorkbookBoxNumberField = Exclude<
  keyof WorkbookBoxStyle,
  "backgroundColor" | "borderColor" | "borderStyle"
>;

const workbookBoxSides = [
  ["Top", "Top"],
  ["Right", "Right"],
  ["Bottom", "Bottom"],
  ["Left", "Left"],
] as const;

function workbookBoxPreviewStyle(
  value: WorkbookBoxStyle | undefined,
  fallbackBorderColor: string,
): React.CSSProperties {
  if (!value) return {};
  const hasBorder =
    value.borderWidth !== undefined ||
    value.borderColor !== undefined ||
    value.borderStyle !== undefined;
  return {
    marginTop: value.marginTop,
    marginRight: value.marginRight,
    marginBottom: value.marginBottom,
    marginLeft: value.marginLeft,
    paddingTop: value.paddingTop,
    paddingRight: value.paddingRight,
    paddingBottom: value.paddingBottom,
    paddingLeft: value.paddingLeft,
    backgroundColor: value.backgroundColor,
    borderWidth: hasBorder ? (value.borderWidth ?? 1) : undefined,
    borderStyle: hasBorder ? (value.borderStyle ?? "solid") : undefined,
    borderColor: hasBorder
      ? (value.borderColor ?? fallbackBorderColor)
      : undefined,
    borderRadius: value.borderRadius,
  };
}

function WorkbookBoxStyleControls({
  label,
  value,
  fallbackBorderColor,
  onChange,
}: {
  label: string;
  value: WorkbookBoxStyle | undefined;
  fallbackBorderColor: string;
  onChange: (value: WorkbookBoxStyle | undefined) => void;
}) {
  function update(nextValue: WorkbookBoxStyle) {
    const entries = Object.entries(nextValue).filter(
      ([, fieldValue]) => fieldValue !== undefined,
    );
    onChange(
      entries.length
        ? (Object.fromEntries(entries) as WorkbookBoxStyle)
        : undefined,
    );
  }

  function setNumber(field: WorkbookBoxNumberField, nextValue: string) {
    update({ ...value, [field]: Number(nextValue) });
  }

  return (
    <details className="mt-3 rounded-[10px] border border-[#d8c8ae] bg-white/80 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none font-bold text-[var(--studio-leaf-dark)]">
        {label}: spacing, background & border
      </summary>
      <div className="mt-3 grid gap-3">
        {(["margin", "padding"] as const).map((group) => (
          <fieldset key={group}>
            <legend className="font-bold capitalize">{group} (px)</legend>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {workbookBoxSides.map(([side, sideLabel]) => {
                const field = `${group}${side}` as WorkbookBoxNumberField;
                return (
                  <label key={field} className="grid gap-1 text-[10px] font-semibold">
                    {sideLabel}
                    <input
                      type="number"
                      min={group === "margin" ? -200 : 0}
                      max={200}
                      value={value?.[field] ?? 0}
                      onChange={(event) => setNumber(field, event.target.value)}
                      className="min-w-0 rounded-[7px] border border-[#d8c8ae] bg-white px-2 py-1.5 text-xs font-normal"
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 font-bold">
            Background
            <span className="flex items-center gap-2">
              <input
                type="color"
                value={value?.backgroundColor ?? "#ffffff"}
                onChange={(event) =>
                  update({ ...value, backgroundColor: event.target.value })
                }
                className="h-9 w-12 rounded border border-[#d8c8ae] bg-white p-1"
              />
              {value?.backgroundColor ? (
                <button
                  type="button"
                  onClick={() =>
                    update({ ...value, backgroundColor: undefined })
                  }
                  className="text-[10px] font-bold text-earth"
                >
                  Clear
                </button>
              ) : (
                <span className="text-[10px] font-normal text-ink/45">None</span>
              )}
            </span>
          </label>
          <label className="grid gap-1 font-bold">
            Border color
            <input
              type="color"
              value={value?.borderColor ?? fallbackBorderColor}
              onChange={(event) =>
                update({ ...value, borderColor: event.target.value })
              }
              className="h-9 w-12 rounded border border-[#d8c8ae] bg-white p-1"
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <label className="grid gap-1 font-bold">
            Style
            <select
              value={value?.borderStyle ?? "none"}
              onChange={(event) => {
                const borderStyle = event.target
                  .value as WorkbookBoxStyle["borderStyle"];
                update({
                  ...value,
                  borderStyle,
                  borderWidth:
                    borderStyle !== "none" && value?.borderWidth === undefined
                      ? 1
                      : value?.borderWidth,
                });
              }}
              className="rounded-[7px] border border-[#d8c8ae] bg-white px-2 py-1.5 font-normal"
            >
              <option value="none">None</option>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
          <label className="grid gap-1 font-bold">
            Width
            <input
              type="number"
              min={0}
              max={20}
              value={value?.borderWidth ?? 0}
              onChange={(event) => setNumber("borderWidth", event.target.value)}
              className="min-w-0 rounded-[7px] border border-[#d8c8ae] bg-white px-2 py-1.5 font-normal"
            />
          </label>
          <label className="grid gap-1 font-bold">
            Radius
            <input
              type="number"
              min={0}
              max={200}
              value={value?.borderRadius ?? 0}
              onChange={(event) => setNumber("borderRadius", event.target.value)}
              className="min-w-0 rounded-[7px] border border-[#d8c8ae] bg-white px-2 py-1.5 font-normal"
            />
          </label>
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="justify-self-start text-[10px] font-bold text-earth underline underline-offset-2"
          >
            Reset layout & appearance
          </button>
        ) : null}
      </div>
    </details>
  );
}

type WorkbookImageBlock = Extract<
  WorkbookLearnBlockLeaf,
  { type: "image_asset" }
>;

function workbookImageFilename(block: WorkbookImageBlock) {
  if (!block.assetId || !block.contentType) return null;
  const extension = block.contentType === "image/jpeg"
    ? "jpg"
    : block.contentType === "image/png"
      ? "png"
      : "webp";
  return `${block.assetId}.${extension}`;
}

function workbookImageUrl(projectId: string, block: WorkbookImageBlock) {
  const filename = workbookImageFilename(block);
  return filename
    ? `/api/workbook-studio/assets/${encodeURIComponent(projectId)}/${encodeURIComponent(filename)}`
    : null;
}

async function workbookUploadError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return payload.error ?? fallback;
}

function WorkbookImageFields({
  block,
  projectId,
  onChange,
}: {
  block: WorkbookImageBlock;
  projectId: string;
  onChange: (block: WorkbookImageBlock) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const imageUrl = workbookImageUrl(projectId, block);

  function update(recipe: (draft: WorkbookImageBlock) => void) {
    const next = structuredClone(block);
    recipe(next);
    onChange(next);
  }

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setUploadError("");
    type PreparedUpload = {
      assetId: string;
      objectPath: string;
      contentType: "image/jpeg" | "image/png" | "image/webp";
      uploadUrl: string;
    };
    let prepared: PreparedUpload | null = null;
    try {
      const prepareResponse = await fetch("/api/workbook-studio/assets/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!prepareResponse.ok) {
        throw new Error(
          await workbookUploadError(
            prepareResponse,
            "Could not prepare the workbook image upload.",
          ),
        );
      }
      prepared = await prepareResponse.json() as PreparedUpload;
      const storageResponse = await fetch(prepared!.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared!.contentType },
        body: file,
      });
      if (!storageResponse.ok) {
        throw new Error("The image could not be uploaded to storage.");
      }
      const completeResponse = await fetch("/api/workbook-studio/assets/upload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          objectPath: prepared!.objectPath,
          assetId: prepared!.assetId,
        }),
      });
      if (!completeResponse.ok) {
        throw new Error(
          await workbookUploadError(
            completeResponse,
            "Could not verify the workbook image.",
          ),
        );
      }
      const asset = await completeResponse.json() as {
        assetId: string;
        contentType: "image/jpeg" | "image/png" | "image/webp";
        pixelWidth: number;
        pixelHeight: number;
      };
      const filename = file.name.replace(/\.[^.]+$/, "").trim();
      onChange({
        ...block,
        assetId: asset.assetId,
        contentType: asset.contentType,
        pixelWidth: asset.pixelWidth,
        pixelHeight: asset.pixelHeight,
        description: filename || block.description,
        altText:
          block.altText === "Describe this image" && filename
            ? filename
            : block.altText,
      });
      prepared = null;
    } catch (error) {
      if (prepared) {
        await fetch("/api/workbook-studio/assets/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            objectPath: prepared.objectPath,
          }),
        }).catch(() => undefined);
      }
      setUploadError(
        error instanceof Error ? error.message : "Could not upload the image.",
      );
    } finally {
      setUploading(false);
    }
  }

  const justifyContent = block.alignment === "left"
    ? "flex-start"
    : block.alignment === "right"
      ? "flex-end"
      : "center";

  return (
    <div className="grid gap-3 rounded-[12px] bg-[var(--studio-sand)] p-3">
      {imageUrl ? (
        <figure>
          <div className="flex" style={{ justifyContent }}>
            <Image
              src={imageUrl}
              alt={block.altText}
              width={block.pixelWidth ?? 1200}
              height={block.pixelHeight ?? 800}
              unoptimized
              className="h-auto max-w-full rounded-[8px] object-contain"
              style={{ width: `${block.widthPercent}%` }}
            />
          </div>
          {block.caption ? (
            <figcaption className="mt-1 text-center text-xs text-ink/55">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="grid min-h-32 place-items-center rounded-[10px] border-2 border-dashed border-[#9fbd89] bg-white px-4 text-center text-sm font-bold text-[#486a38] disabled:opacity-60"
        >
          {uploading ? "Uploading image…" : "Upload a JPEG, PNG, or WebP image"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = "";
        }}
      />
      {uploadError ? (
        <p className="rounded-[9px] bg-[#fff0ea] px-3 py-2 text-xs font-semibold text-[#8c3f2f]">
          {uploadError}
        </p>
      ) : null}
      <label className="grid gap-1 text-xs font-bold">
        Alternative text
        <input
          value={block.altText}
          onChange={(event) =>
            update((draft) => {
              draft.altText = event.target.value;
            })
          }
          className="rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Caption
        <input
          value={block.caption ?? ""}
          onChange={(event) =>
            update((draft) => {
              draft.caption = event.target.value || undefined;
            })
          }
          className="rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
          placeholder="Optional caption"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Width: {block.widthPercent}%
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={block.widthPercent}
          onChange={(event) =>
            update((draft) => {
              draft.widthPercent = Number(event.target.value);
            })
          }
          className="accent-[#739e56]"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Alignment
        <select
          value={block.alignment}
          onChange={(event) =>
            update((draft) => {
              draft.alignment = event.target.value as WorkbookImageBlock["alignment"];
            })
          }
          className="rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      {imageUrl ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-[9px] border border-[#bca98a] bg-white px-3 py-2 text-xs font-bold disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Replace image"}
          </button>
          <button
            type="button"
            onClick={() =>
              update((draft) => {
                draft.assetId = null;
                draft.contentType = null;
                draft.pixelWidth = null;
                draft.pixelHeight = null;
              })
            }
            className="rounded-[9px] border border-[#e4b9a9] bg-white px-3 py-2 text-xs font-bold text-[#8c3f2f]"
          >
            Remove image
          </button>
        </div>
      ) : null}
    </div>
  );
}

type WorkbookQrCodeBlock = Extract<
  WorkbookLearnBlockLeaf,
  { type: "qr_code" }
>;

function WorkbookQrCodeFields({
  block,
  onChange,
}: {
  block: WorkbookQrCodeBlock;
  onChange: (block: WorkbookQrCodeBlock) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const data = block.data.trim();
    if (!data) {
      setPreviewUrl("");
      setPreviewError("");
      setPreviewing(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPreviewing(true);
      setPreviewUrl("");
      setPreviewError("");
      void fetch("/api/workbook-studio/qr-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(
              await workbookUploadError(
                response,
                "Could not generate the QR code preview.",
              ),
            );
          }
          return response.json() as Promise<{ dataUrl: string }>;
        })
        .then((payload) => {
          if (!controller.signal.aborted) setPreviewUrl(payload.dataUrl);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPreviewUrl("");
          setPreviewError(
            error instanceof Error
              ? error.message
              : "Could not generate the QR code preview.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewing(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [block.data]);

  function update(recipe: (draft: WorkbookQrCodeBlock) => void) {
    const next = structuredClone(block);
    recipe(next);
    onChange(next);
  }

  return (
    <div className="grid gap-3 rounded-[12px] bg-[var(--studio-sand)] p-3">
      <figure className="grid justify-items-center gap-2 rounded-[10px] bg-white p-4 text-center">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={block.description || "QR code preview"}
            width={512}
            height={512}
            unoptimized
            className="h-auto max-w-full"
            style={{ width: `${block.sizeMm * 4}px` }}
          />
        ) : (
          <div className="grid aspect-square w-36 place-items-center rounded-[8px] border-2 border-dashed border-[#9fbd89] px-3 text-xs font-bold text-[#486a38]">
            {previewing ? "Generating QR code…" : "Enter data to generate a QR code"}
          </div>
        )}
        <figcaption className="max-w-sm text-xs leading-5 text-ink/60">
          {block.description}
        </figcaption>
      </figure>
      {previewError ? (
        <p className="rounded-[9px] bg-[#fff0ea] px-3 py-2 text-xs font-semibold text-[#8c3f2f]">
          {previewError}
        </p>
      ) : null}
      <label className="grid gap-1 text-xs font-bold">
        Data
        <textarea
          value={block.data}
          maxLength={2_048}
          rows={3}
          onChange={(event) =>
            update((draft) => {
              draft.data = event.target.value;
            })
          }
          className="resize-y rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
          placeholder="https://example.com or any text"
        />
        <span className="font-normal text-ink/45">
          URLs, plain text, and other QR-compatible data are supported.
        </span>
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Description
        <textarea
          value={block.description}
          maxLength={500}
          rows={2}
          onChange={(event) =>
            update((draft) => {
              draft.description = event.target.value;
            })
          }
          className="resize-y rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
          placeholder="This text appears below the QR code."
        />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Printed size: {block.sizeMm} mm
        <input
          type="range"
          min={20}
          max={80}
          step={1}
          value={block.sizeMm}
          onChange={(event) =>
            update((draft) => {
              draft.sizeMm = Number(event.target.value);
            })
          }
          className="accent-[#739e56]"
        />
      </label>
    </div>
  );
}

type WorkbookSoundBlock = Extract<
  WorkbookLearnBlockLeaf,
  { type: "sound_asset" }
>;

function workbookSoundExtension(block: WorkbookSoundBlock) {
  if (block.contentType === "audio/mpeg") return "mp3";
  if (block.contentType === "audio/mp4") return "m4a";
  if (block.contentType === "audio/wav") return "wav";
  if (block.contentType === "audio/ogg") return "ogg";
  return null;
}

function workbookSoundUrl(projectId: string, block: WorkbookSoundBlock) {
  const extension = workbookSoundExtension(block);
  return block.assetId && extension
    ? `/media/workbooks/${encodeURIComponent(projectId)}/${encodeURIComponent(`${block.assetId}.${extension}`)}`
    : null;
}

function workbookSoundUploadContentType(file: File) {
  const normalized = file.type.split(";", 1)[0]!.trim().toLowerCase();
  if (normalized === "audio/mp3") return "audio/mpeg";
  if (normalized === "audio/x-m4a") return "audio/mp4";
  if (normalized === "audio/x-wav" || normalized === "audio/wave") {
    return "audio/wav";
  }
  if (["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"].includes(normalized)) {
    return normalized;
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "wav") return "audio/wav";
  if (extension === "ogg") return "audio/ogg";
  return file.type;
}

function WorkbookSoundFields({
  block,
  projectId,
  onChange,
}: {
  block: WorkbookSoundBlock;
  projectId: string;
  onChange: (block: WorkbookSoundBlock) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const soundUrl = workbookSoundUrl(projectId, block);

  function update(recipe: (draft: WorkbookSoundBlock) => void) {
    const next = structuredClone(block);
    recipe(next);
    onChange(next);
  }

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setUploadError("");
    type PreparedUpload = {
      assetId: string;
      objectPath: string;
      contentType: "audio/mpeg" | "audio/mp4" | "audio/wav" | "audio/ogg";
      uploadUrl: string;
    };
    let prepared: PreparedUpload | null = null;
    try {
      const prepareResponse = await fetch("/api/workbook-studio/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          contentType: workbookSoundUploadContentType(file),
          sizeBytes: file.size,
        }),
      });
      if (!prepareResponse.ok) {
        throw new Error(
          await workbookUploadError(
            prepareResponse,
            "Could not prepare the workbook sound upload.",
          ),
        );
      }
      prepared = await prepareResponse.json() as PreparedUpload;
      const storageResponse = await fetch(prepared.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.contentType },
        body: file,
      });
      if (!storageResponse.ok) {
        throw new Error("The sound could not be uploaded to storage.");
      }
      const completeResponse = await fetch("/api/workbook-studio/media/upload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          objectPath: prepared.objectPath,
          assetId: prepared.assetId,
          fileName: file.name,
        }),
      });
      if (!completeResponse.ok) {
        throw new Error(
          await workbookUploadError(
            completeResponse,
            "Could not verify the workbook sound.",
          ),
        );
      }
      const asset = await completeResponse.json() as {
        assetId: string;
        contentType: PreparedUpload["contentType"];
        fileName: string | null;
        sizeBytes: number;
      };
      onChange({
        ...block,
        assetId: asset.assetId,
        contentType: asset.contentType,
        fileName: asset.fileName,
        sizeBytes: asset.sizeBytes,
      });
      prepared = null;
    } catch (error) {
      if (prepared) {
        await fetch("/api/workbook-studio/media/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            objectPath: prepared.objectPath,
          }),
        }).catch(() => undefined);
      }
      setUploadError(
        error instanceof Error ? error.message : "Could not upload the sound.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-[12px] bg-[var(--studio-sand)] p-3">
      {soundUrl ? (
        <div className="rounded-[10px] bg-white p-4">
          <p className="mb-2 text-sm font-bold text-ink">
            {block.description}
          </p>
          <audio
            key={soundUrl}
            controls
            preload="metadata"
            src={soundUrl}
            className="w-full"
          >
            Your browser does not support audio playback.
          </audio>
          <p className="mt-2 truncate text-xs text-ink/45">
            {block.fileName ?? "Workbook sound"}
            {block.sizeBytes
              ? ` · ${(block.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
              : ""}
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="grid min-h-32 place-items-center rounded-[10px] border-2 border-dashed border-[#9fbd89] bg-white px-4 text-center text-sm font-bold text-[#486a38] disabled:opacity-60"
        >
          {uploading ? "Uploading sound…" : "Upload an MP3, M4A, WAV, or OGG sound"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = "";
        }}
      />
      {uploadError ? (
        <p className="rounded-[9px] bg-[#fff0ea] px-3 py-2 text-xs font-semibold text-[#8c3f2f]">
          {uploadError}
        </p>
      ) : null}
      <label className="grid gap-1 text-xs font-bold">
        Description
        <textarea
          value={block.description}
          maxLength={500}
          rows={2}
          onChange={(event) =>
            update((draft) => {
              draft.description = event.target.value;
            })
          }
          className="resize-y rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
          placeholder="Listen to the pronunciation."
        />
        <span className="font-normal text-ink/45">
          In PDFs, this appears below a QR code linked to the sound.
        </span>
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Printed QR size: {block.qrSizeMm} mm
        <input
          type="range"
          min={20}
          max={80}
          step={1}
          value={block.qrSizeMm}
          onChange={(event) =>
            update((draft) => {
              draft.qrSizeMm = Number(event.target.value);
            })
          }
          className="accent-[#739e56]"
        />
      </label>
      {soundUrl ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-[9px] border border-[#bca98a] bg-white px-3 py-2 text-xs font-bold disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Replace sound"}
          </button>
          <button
            type="button"
            onClick={() =>
              update((draft) => {
                draft.assetId = null;
                draft.contentType = null;
                draft.fileName = null;
                draft.sizeBytes = null;
              })
            }
            className="rounded-[9px] border border-[#e4b9a9] bg-white px-3 py-2 text-xs font-bold text-[#8c3f2f]"
          >
            Remove sound
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WorkbookLearnLeafFields({
  block,
  projectId,
  onChange,
}: {
  block: WorkbookLearnBlockLeaf;
  projectId: string;
  onChange: (block: WorkbookLearnBlockLeaf) => void;
}) {
  function update(recipe: (draft: WorkbookLearnBlockLeaf) => void) {
    const next = structuredClone(block);
    recipe(next);
    onChange(next);
  }

  if (block.type === "paragraph" || block.type === "callout") {
    return (
      <textarea
        value={block.text}
        onChange={(event) =>
          update((draft) => {
            if (draft.type === "paragraph" || draft.type === "callout") {
              draft.text = event.target.value;
            }
          })
        }
        className={`w-full resize-y bg-transparent leading-7 outline-none ${block.type === "callout" ? "min-h-20 rounded-[8px] border-2 border-[var(--studio-leaf)] p-3" : "min-h-24"}`}
      />
    );
  }
  if (block.type === "vocabulary_list") {
    return (
      <div>
        <strong className="text-xs uppercase tracking-wide text-[var(--studio-leaf-dark)]">
          Vocabulary
        </strong>
        <textarea
          value={block.entries
            .map((entry) =>
              [entry.term, entry.pronunciation ?? "", entry.definition].join(
                " | ",
              ),
            )
            .join("\n")}
          onChange={(event) =>
            update((draft) => {
              if (draft.type !== "vocabulary_list") return;
              draft.entries = event.target.value
                .split("\n")
                .filter(Boolean)
                .map((line) => {
                  const [term, pronunciation, definition] = line.split("|");
                  return {
                    term: term?.trim() || "Word",
                    pronunciation: pronunciation?.trim() || undefined,
                    definition: definition?.trim() || "Definition",
                  };
                });
            })
          }
          className="mt-2 min-h-28 w-full rounded-[8px] border border-[var(--studio-leaf)] bg-white p-3 text-sm outline-none"
        />
      </div>
    );
  }
  if (block.type === "reading_passage") {
    return (
      <div>
        <strong className="text-xs uppercase tracking-wide text-[var(--studio-leaf-dark)]">
          Reading passage
        </strong>
        <textarea
          value={block.paragraphs.join("\n\n")}
          onChange={(event) =>
            update((draft) => {
              if (draft.type !== "reading_passage") return;
              draft.paragraphs = event.target.value
                .split(/\n\s*\n/)
                .map((paragraph) => paragraph.trim())
                .filter(Boolean);
            })
          }
          className="mt-2 min-h-40 w-full resize-y rounded-[8px] border border-[var(--studio-leaf)] bg-white p-3 leading-7 outline-none"
        />
      </div>
    );
  }
  if (block.type === "character_practice") {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {([
          ["Character", "character"],
          ["Pronunciation", "pronunciation"],
          ["Meaning", "meaning"],
        ] as const).map(([label, field]) => (
          <label key={field} className="grid gap-1 text-xs font-bold">
            {label}
            <input
              value={block[field] ?? ""}
              onChange={(event) =>
                update((draft) => {
                  if (draft.type === "character_practice") {
                    draft[field] = event.target.value;
                  }
                })
              }
              className={`rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 ${field === "character" ? "text-2xl" : "text-sm"}`}
            />
          </label>
        ))}
      </div>
    );
  }
  if (block.type === "illustration") {
    return (
      <div className="grid gap-3 rounded-[10px] bg-[var(--studio-sand)] p-4 text-sm">
        <strong>Illustration: {block.illustrationType}</strong>
        <label className="grid gap-1 text-xs font-bold">
          Alternative text
          <input
            value={block.altText}
            onChange={(event) =>
              update((draft) => {
                if (draft.type === "illustration") {
                  draft.altText = event.target.value;
                }
              })
            }
            className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold">
          Caption
          <input
            value={block.caption ?? ""}
            onChange={(event) =>
              update((draft) => {
                if (draft.type === "illustration") {
                  draft.caption = event.target.value || undefined;
                }
              })
            }
            className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold">
          Parameters (JSON)
          <textarea
            defaultValue={JSON.stringify(block.parameters, null, 2)}
            onChange={(event) => {
              try {
                const parameters = JSON.parse(event.target.value) as Record<
                  string,
                  unknown
                >;
                update((draft) => {
                  if (draft.type === "illustration") {
                    draft.parameters = parameters;
                  }
                });
              } catch {
                // Keep the last valid parameter object while JSON is incomplete.
              }
            }}
            className="min-h-28 rounded-[8px] border border-[#d8c8ae] bg-white p-2 font-mono text-xs font-normal"
          />
        </label>
      </div>
    );
  }
  if (block.type === "image_asset") {
    return (
      <WorkbookImageFields
        block={block}
        projectId={projectId}
        onChange={onChange}
      />
    );
  }
  if (block.type === "qr_code") {
    return <WorkbookQrCodeFields block={block} onChange={onChange} />;
  }
  if (block.type === "sound_asset") {
    return (
      <WorkbookSoundFields
        block={block}
        projectId={projectId}
        onChange={onChange}
      />
    );
  }
  return (
    <div className="rounded-[10px] bg-[var(--studio-sand)] p-4 text-sm">
      Unsupported learning element.
    </div>
  );
}

function WorkbookExerciseLeafFields({
  exercise,
  onChange,
}: {
  exercise: WorkbookExerciseLeaf;
  onChange: (exercise: WorkbookExerciseLeaf) => void;
}) {
  function update(recipe: (draft: WorkbookExerciseLeaf) => void) {
    const next = structuredClone(exercise);
    recipe(next);
    onChange(next);
  }

  return (
    <>
      <select
        value={exercise.type}
        onChange={(event) => {
          const replacement = makeExercise(
            event.target.value as ExerciseType,
            exercise.id,
          );
          replacement.boxStyle = exercise.boxStyle;
          onChange(replacement);
        }}
        className="rounded-[8px] border border-[#d8c8ae] bg-white px-2 py-1 text-xs font-bold"
      >
        <option value="circle_choice">Circle choice</option>
        <option value="multiple_choice">Multiple choice</option>
        <option value="matching">Matching</option>
        <option value="fill_in_blank">Fill in blank</option>
        <option value="short_answer">Short answer</option>
        <option value="write">Writing</option>
        <option value="draw_box">Drawing box</option>
      </select>
      <textarea
        value={exercise.prompt}
        onChange={(event) =>
          update((draft) => {
            draft.prompt = event.target.value;
          })
        }
        className="mt-2 min-h-16 w-full resize-y bg-transparent leading-6 outline-none"
      />
      {exercise.type === "circle_choice" ||
      exercise.type === "multiple_choice" ? (
        <div className="grid gap-2">
          <textarea
            value={(exercise.options ?? []).join("\n")}
            onChange={(event) =>
              update((draft) => {
                if (
                  draft.type === "circle_choice" ||
                  draft.type === "multiple_choice"
                ) {
                  draft.options = event.target.value.split("\n").filter(Boolean);
                }
              })
            }
            className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
          />
          <input
            value={exercise.correctAnswer}
            onChange={(event) =>
              update((draft) => {
                if (
                  draft.type === "circle_choice" ||
                  draft.type === "multiple_choice"
                ) {
                  draft.correctAnswer = event.target.value;
                }
              })
            }
            className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
            placeholder="Correct answer"
          />
        </div>
      ) : exercise.type === "matching" ? (
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={exercise.leftLabel ?? "Item"}
              onChange={(event) =>
                update((draft) => {
                  if (draft.type === "matching")
                    draft.leftLabel = event.target.value;
                })
              }
              className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
              placeholder="Left column label"
            />
            <input
              value={exercise.rightLabel ?? "Match"}
              onChange={(event) =>
                update((draft) => {
                  if (draft.type === "matching")
                    draft.rightLabel = event.target.value;
                })
              }
              className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
              placeholder="Right column label"
            />
          </div>
          <textarea
            value={(exercise.pairs ?? [])
              .map((pair) => `${pair.left} | ${pair.right}`)
              .join("\n")}
            onChange={(event) =>
              update((draft) => {
                if (draft.type !== "matching") return;
                const pairs = event.target.value
                  .split("\n")
                  .filter(Boolean)
                  .map((line, pairIndex) => {
                    const [left, right] = line.split("|");
                    return {
                      id: `${exercise.id}-pair-${pairIndex + 1}`,
                      left: left?.trim() || "Item",
                      right: right?.trim() || "Match",
                    };
                  });
                draft.pairs = pairs;
                draft.rightOrder = pairs.map((pair) => pair.id).reverse();
              })
            }
            className="min-h-24 w-full rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
          />
        </div>
      ) : (
        <input
          value={String(
            exercise.type === "write" || exercise.type === "draw_box"
              ? exercise.sampleAnswer
              : exercise.correctAnswer,
          )}
          onChange={(event) =>
            update((draft) => {
              if (draft.type === "write" || draft.type === "draw_box") {
                draft.sampleAnswer = event.target.value;
              } else {
                draft.correctAnswer = event.target.value;
              }
            })
          }
          className="w-full rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
          placeholder="Answer"
        />
      )}
    </>
  );
}

function WorkbookLearnLeafPreview({
  block,
  projectId,
}: {
  block: WorkbookLearnBlockLeaf;
  projectId: string;
}) {
  if (block.type === "paragraph") {
    return <p className="leading-7">{block.text}</p>;
  }
  if (block.type === "callout") {
    return (
      <aside className="rounded-[10px] border-2 border-[var(--studio-leaf)] bg-[var(--studio-sand)] p-3 leading-6">
        {block.label ? <strong>{block.label} </strong> : null}
        {block.text}
      </aside>
    );
  }
  if (block.type === "image_asset") {
    const imageUrl = workbookImageUrl(projectId, block);
    const justifyContent = block.alignment === "left"
      ? "flex-start"
      : block.alignment === "right"
        ? "flex-end"
        : "center";
    return imageUrl ? (
      <figure>
        <div className="flex" style={{ justifyContent }}>
          <Image
            src={imageUrl}
            alt={block.altText}
            width={block.pixelWidth ?? 1200}
            height={block.pixelHeight ?? 800}
            unoptimized
            className="h-auto max-w-full object-contain"
            style={{ width: `${block.widthPercent}%` }}
          />
        </div>
        {block.caption ? (
          <figcaption className="mt-1 text-center text-xs text-ink/55">
            {block.caption}
          </figcaption>
        ) : null}
      </figure>
    ) : (
      <div className="grid min-h-28 place-items-center rounded-[9px] border-2 border-dashed border-ink/20 px-4 text-center text-sm text-ink/45">
        Image not uploaded
      </div>
    );
  }
  if (block.type === "qr_code") {
    return (
      <figure className="grid justify-items-center gap-2 text-center">
        <div
          className="grid aspect-square max-w-full place-items-center border-[10px] border-white bg-[repeating-conic-gradient(#25201b_0_25%,white_0_50%)] bg-[length:18px_18px] shadow-sm"
          style={{ width: `${Math.min(block.sizeMm * 3, 240)}px` }}
          aria-hidden="true"
        >
          <span className="rounded bg-white px-2 py-1 text-[10px] font-black text-ink">
            QR
          </span>
        </div>
        <figcaption className="max-w-sm text-xs leading-5 text-ink/60">
          {block.description}
        </figcaption>
      </figure>
    );
  }
  if (block.type === "sound_asset") {
    const soundUrl = workbookSoundUrl(projectId, block);
    return (
      <div className="rounded-[10px] bg-[var(--studio-sand)] p-3">
        <p className="mb-2 text-sm font-bold">{block.description}</p>
        {soundUrl ? (
          <audio controls preload="metadata" src={soundUrl} className="w-full">
            Your browser does not support audio playback.
          </audio>
        ) : (
          <div className="rounded-[9px] border border-dashed border-ink/25 bg-white px-4 py-3 text-center text-sm text-ink/45">
            Sound not uploaded
          </div>
        )}
      </div>
    );
  }
  if (block.type === "vocabulary_list") {
    return (
      <section>
        <h4 className="font-bold text-[var(--studio-leaf-dark)]">
          {block.title ?? "Vocabulary"}
        </h4>
        <dl className="mt-2 grid gap-2">
          {block.entries.map((entry, index) => (
            <div key={`${entry.term}-${index}`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 border-b border-[var(--studio-sand)] pb-2">
              <dt className="font-bold">
                {entry.term}
                {entry.pronunciation ? (
                  <span className="ml-1 font-normal text-ink/45">
                    {entry.pronunciation}
                  </span>
                ) : null}
              </dt>
              <dd>{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }
  if (block.type === "reading_passage") {
    return (
      <article>
        {block.title ? (
          <h4 className="mb-2 font-bold text-[var(--studio-leaf-dark)]">
            {block.title}
          </h4>
        ) : null}
        {block.paragraphs.map((paragraph, index) => (
          <p key={index} className="mb-3 leading-7 last:mb-0">
            {paragraph}
          </p>
        ))}
      </article>
    );
  }
  if (block.type === "character_practice") {
    return (
      <section className="text-center">
        <div className="text-6xl font-bold">{block.character}</div>
        <p className="mt-1 text-sm text-ink/55">
          {[block.pronunciation, block.meaning].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 grid gap-2">
          {Array.from({ length: block.traceRows }, (_, index) => (
            <div key={index} className="grid grid-cols-4 border border-[var(--studio-leaf)]/45 text-3xl text-ink/15">
              <span className="border-r border-[var(--studio-leaf)]/35 py-2">
                {block.character}
              </span>
              <span className="border-r border-[var(--studio-leaf)]/35" />
              <span className="border-r border-[var(--studio-leaf)]/35" />
              <span />
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <figure className="rounded-[10px] border border-dashed border-[var(--studio-leaf)] p-4 text-center">
      <strong className="text-sm">Illustration</strong>
      <p className="mt-1 text-xs text-ink/50">{block.altText}</p>
    </figure>
  );
}

function WorkbookExerciseLeafPreview({
  exercise,
}: {
  exercise: WorkbookExerciseLeaf;
}) {
  return (
    <div>
      <p className="leading-6">{exercise.prompt}</p>
      {exercise.type === "circle_choice" ||
      exercise.type === "multiple_choice" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(exercise.options ?? []).map((option) => (
            <span key={option} className="rounded-full border border-ink/25 px-3 py-1 text-sm">
              {option}
            </span>
          ))}
        </div>
      ) : exercise.type === "matching" ? (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {(exercise.pairs ?? []).map((pair) => (
            <div key={pair.id} className="contents">
              <span>{pair.left}</span>
              <span>{pair.right}</span>
            </div>
          ))}
        </div>
      ) : exercise.type === "draw_box" ? (
        <div
          className="mt-3 border-2 border-ink/35"
          style={{ minHeight: `${(exercise.boxHeightMm ?? 60) * 2}px` }}
        />
      ) : (
        <div className="mt-3 grid gap-3">
          {Array.from(
            {
              length:
                exercise.type === "write" || exercise.type === "short_answer"
                  ? exercise.writingLines ?? 3
                  : 1,
            },
            (_, index) => (
              <span key={index} className="h-5 border-b border-ink/30" />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function WorkbookLearnBlockBrowserPreview({
  block,
  projectId,
  fallbackBorderColor,
}: {
  block: WorkbookLearnBlock;
  projectId: string;
  fallbackBorderColor: string;
}) {
  if (block.type === "layout_row") {
    return (
      <div
        className="grid"
        style={{
          ...workbookBoxPreviewStyle(block.boxStyle, fallbackBorderColor),
          gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))`,
          gap: `${block.columnGap ?? 16}px`,
        }}
      >
        {block.columns.map((column) => (
          <div key={column.id} className="min-w-0">
            {column.blocks.map((child, index) => (
              <WorkbookLearnBlockBrowserPreview
                key={`${column.id}-${index}`}
                block={child}
                projectId={projectId}
                fallbackBorderColor={fallbackBorderColor}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={workbookBoxPreviewStyle(block.boxStyle, fallbackBorderColor)}>
      <WorkbookLearnLeafPreview block={block} projectId={projectId} />
    </div>
  );
}

function workbookExerciseCount(exercise: WorkbookExercise) {
  return exercise.type === "layout_row"
    ? exercise.columns.reduce(
        (total, column) => total + column.exercises.length,
        0,
      )
    : 1;
}

function WorkbookExerciseBrowserPreview({
  exercise,
  startNumber,
  fallbackBorderColor,
}: {
  exercise: WorkbookExercise;
  startNumber: number;
  fallbackBorderColor: string;
}) {
  if (exercise.type === "layout_row") {
    let number = startNumber;
    return (
      <div
        className="grid"
        style={{
          ...workbookBoxPreviewStyle(exercise.boxStyle, fallbackBorderColor),
          gridTemplateColumns: `repeat(${exercise.columns.length}, minmax(0, 1fr))`,
          gap: `${exercise.columnGap ?? 16}px`,
        }}
      >
        {exercise.columns.map((column) => (
          <div key={column.id} className="min-w-0">
            {column.exercises.map((child) => {
              const exerciseNumber = number;
              number += 1;
              return (
                <WorkbookExerciseBrowserPreview
                  key={child.id}
                  exercise={child}
                  startNumber={exerciseNumber}
                  fallbackBorderColor={fallbackBorderColor}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2"
      style={workbookBoxPreviewStyle(
        exercise.boxStyle,
        fallbackBorderColor,
      )}
    >
      <strong>{startNumber}.</strong>
      <WorkbookExerciseLeafPreview exercise={exercise} />
    </div>
  );
}

function WorkbookLessonBrowserPreview({
  content,
  chapterIndex,
  lessonIndex,
  projectId,
  fallbackBorderColor,
}: {
  content: WorkbookContent;
  chapterIndex: number;
  lessonIndex: number;
  projectId: string;
  fallbackBorderColor: string;
}) {
  const lesson = content.chapters[chapterIndex].lessons[lessonIndex];
  let nextExerciseNumber = 1;
  return (
    <article
      className="mx-auto min-h-[900px] w-full max-w-[800px] bg-[var(--studio-canvas)] p-8 text-[var(--studio-ink)] shadow-[0_12px_40px_rgba(32,26,20,0.2)] sm:p-12"
      style={workbookBoxPreviewStyle(lesson.boxStyle, fallbackBorderColor)}
    >
      <h1 className="border-b-[3px] border-[var(--studio-leaf)] pb-2 text-2xl font-bold text-[var(--studio-leaf-dark)]">
        Lesson {chapterIndex + 1}.{lessonIndex + 1} — {lesson.title}
      </h1>
      {lesson.subtitle ? (
        <p className="mt-2 text-sm text-ink/55">{lesson.subtitle}</p>
      ) : null}
      <p className="mt-7 inline-block border-b-2 border-[var(--studio-leaf)] text-sm font-bold text-[var(--studio-leaf-dark)]">
        Part 1: Learn
      </p>
      <div
        className="mt-4 grid gap-3"
        style={workbookBoxPreviewStyle(
          lesson.learnSectionBoxStyle,
          fallbackBorderColor,
        )}
      >
        {lesson.learnBlocks.map((block, index) => (
          <WorkbookLearnBlockBrowserPreview
            key={block.type === "layout_row" ? block.id : index}
            block={block}
            projectId={projectId}
            fallbackBorderColor={fallbackBorderColor}
          />
        ))}
      </div>
      <p className="mt-8 inline-block border-b-2 border-[var(--studio-leaf)] text-sm font-bold text-[var(--studio-leaf-dark)]">
        Part 2: Practice
      </p>
      <div
        className="mt-4 grid gap-5"
        style={workbookBoxPreviewStyle(
          lesson.practiceSectionBoxStyle,
          fallbackBorderColor,
        )}
      >
        {lesson.exercises.map((exercise) => {
          const startNumber = nextExerciseNumber;
          nextExerciseNumber += workbookExerciseCount(exercise);
          return (
            <WorkbookExerciseBrowserPreview
              key={exercise.id}
              exercise={exercise}
              startNumber={startNumber}
              fallbackBorderColor={fallbackBorderColor}
            />
          );
        })}
      </div>
    </article>
  );
}

function WorkbookItemInspector({
  item,
  location,
  projectId,
  fallbackBorderColor,
  onChange,
  onClear,
}: {
  item: WorkbookEditorItem;
  location: WorkbookItemLocation;
  projectId: string;
  fallbackBorderColor: string;
  onChange: (item: WorkbookEditorItem) => void;
  onClear: () => void;
}) {
  const label = item.type === "layout_row"
    ? "Layout"
    : location.collection === "learn"
      ? "Learning element"
      : "Exercise";
  return (
    <div className="mt-4 grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-earth">
            Selected
          </p>
          <h3 className="mt-1 font-bold">{label}</h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-[9px] border border-[#d8c8ae] bg-white px-2.5 py-1.5 text-xs font-bold text-earth"
        >
          Done
        </button>
      </div>
      {item.type === "layout_row" ? (
        <div className="grid gap-3 rounded-[12px] bg-white p-3">
          <p className="text-sm">
            <strong>{item.columns.length}</strong> columns
          </p>
          <label className="grid gap-1 text-xs font-bold">
            Column gap
            <input
              type="number"
              min={0}
              max={100}
              value={item.columnGap ?? 16}
              onChange={(event) =>
                onChange({
                  ...item,
                  columnGap: Math.min(
                    Math.max(Number(event.target.value) || 0, 0),
                    100,
                  ),
                })
              }
              className="rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 font-normal"
            />
          </label>
        </div>
      ) : location.collection === "learn" ? (
        <WorkbookLearnLeafFields
          block={item as WorkbookLearnBlockLeaf}
          projectId={projectId}
          onChange={onChange}
        />
      ) : (
        <div className="rounded-[12px] bg-white p-3">
          <WorkbookExerciseLeafFields
            exercise={item as WorkbookExerciseLeaf}
            onChange={onChange}
          />
        </div>
      )}
      <WorkbookBoxStyleControls
        label={label}
        value={item.boxStyle}
        fallbackBorderColor={fallbackBorderColor}
        onChange={(boxStyle) => onChange({ ...item, boxStyle })}
      />
    </div>
  );
}

function coverGradeBadgeParts(label: string) {
  const match = label.trim().match(/^(grades?|ages?)\s+(.+)$/i);
  return match
    ? { value: match[2], noun: match[1].toUpperCase() }
    : { value: label, noun: "GRADE" };
}

function WorkbookCoverCanvas({
  content,
  detail,
  onChange,
}: {
  content: WorkbookContent;
  detail: WorkbookStudioProjectDetail;
  onChange: (mutator: (draft: WorkbookContent) => void) => void;
}) {
  const badge = coverGradeBadgeParts(content.gradeLabel);
  const artworkUrl = `/api/workbook-studio/cover-preview/${encodeURIComponent(detail.project.id)}?format=artwork&asset=${encodeURIComponent(detail.project.coverImageSha256 ?? "latest")}`;
  return (
    <div
      className="relative mx-auto aspect-[210/297] w-full max-w-[720px] overflow-hidden rounded-[22px] border-[4px] text-center shadow-[0_16px_48px_rgba(70,50,30,0.2)]"
      style={{
        backgroundColor: detail.effectiveTheme.colorSand,
        borderColor: detail.effectiveTheme.colorLeaf,
        color: detail.effectiveTheme.colorInk,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 flex h-[12%] items-center gap-2 px-[2%] text-left"
        style={{ backgroundColor: detail.effectiveTheme.colorCoverAccent }}
      >
        <Image
          src="/workbook-tree-icon.png"
          alt="Treeschool tree logo"
          width={82}
          height={96}
          unoptimized
          className="h-[86%] w-auto object-contain"
        />
        <span className="text-[clamp(1.2rem,4vw,2.5rem)] font-black lowercase tracking-[-0.05em] text-white">
          treeschool
        </span>
      </div>
      <div
        className="absolute right-0 top-0 z-10 flex h-[25%] w-[31%] flex-col items-center justify-center rounded-bl-[38%] px-2 text-white"
        style={{ backgroundColor: detail.effectiveTheme.colorCoverAccent }}
      >
        <strong className="text-[clamp(1.7rem,8vw,5rem)] leading-none">
          {badge.value}
        </strong>
        <span className="mt-2 text-[clamp(0.65rem,2.2vw,1.35rem)] font-black uppercase tracking-wide">
          {badge.noun}
        </span>
      </div>
      <div className="absolute inset-x-[7%] bottom-[9%] top-[17%] flex flex-col items-center justify-center">
        <div className="relative h-[40%] w-[86%]">
          {detail.project.coverImageObjectPath ? (
            <Image
              src={artworkUrl}
              alt={detail.project.coverImageAlt ?? `${content.subjectLabel} cover artwork`}
              fill
              sizes="620px"
              unoptimized
              className="object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center rounded-[16px] border-2 border-dashed border-current/20 text-sm opacity-50">
              Add cover artwork before release.
            </div>
          )}
        </div>
        <input
          value={content.subjectLabel}
          onChange={(event) =>
            onChange((draft) => {
              draft.subjectLabel = event.target.value;
              draft.title = event.target.value;
            })
          }
          aria-label="Cover title"
          className="mt-[2%] w-full border-0 bg-transparent text-center text-[clamp(2rem,8vw,5.5rem)] font-black leading-none outline-none"
          style={{ color: detail.effectiveTheme.colorCoverAccent }}
        />
        {content.isCore ? (
          <span
            className="mt-[2%] rounded-full px-5 py-2 text-xs font-black uppercase tracking-wide sm:text-base"
            style={{
              backgroundColor: detail.effectiveTheme.colorCoverAccentSoft,
              color: detail.effectiveTheme.colorCoverAccent,
            }}
          >
            Core curriculum
          </span>
        ) : null}
        <textarea
          value={content.subtitle ?? ""}
          onChange={(event) =>
            onChange((draft) => {
              draft.subtitle = event.target.value;
            })
          }
          aria-label="Cover subtitle"
          rows={2}
          className="mt-[3%] w-full resize-none border-0 bg-transparent text-center text-[clamp(0.85rem,3vw,1.8rem)] leading-snug outline-none"
          style={{ color: detail.effectiveTheme.colorEarth }}
        />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex h-[7%] items-center justify-end px-[3%]"
        style={{ backgroundColor: detail.effectiveTheme.colorCoverAccent }}
      >
        <input
          value={content.editionLabel}
          onChange={(event) =>
            onChange((draft) => {
              draft.editionLabel = event.target.value;
            })
          }
          aria-label="Edition label"
          className="w-1/2 border-0 bg-transparent text-right text-xs font-bold text-white outline-none sm:text-base"
        />
      </div>
    </div>
  );
}

function WorkbookCoverInspector({
  content,
  detail,
  themes,
  themePending,
  onChange,
  onThemeChange,
}: {
  content: WorkbookContent;
  detail: WorkbookStudioProjectDetail;
  themes: WorkbookStudioSummary["themes"];
  themePending: boolean;
  onChange: (mutator: (draft: WorkbookContent) => void) => void;
  onThemeChange: (themeVersionId: string | null) => void;
}) {
  return (
    <div className="mt-4 grid gap-4">
      <label className="grid gap-1 text-xs font-bold">
        Cover title
        <input
          value={content.subjectLabel}
          onChange={(event) =>
            onChange((draft) => {
              draft.subjectLabel = event.target.value;
              draft.title = event.target.value;
            })
          }
          className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Subtitle
        <textarea
          value={content.subtitle ?? ""}
          onChange={(event) =>
            onChange((draft) => {
              draft.subtitle = event.target.value;
            })
          }
          rows={3}
          className="resize-none rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Grade label
        <input
          value={content.gradeLabel}
          onChange={(event) =>
            onChange((draft) => {
              draft.gradeLabel = event.target.value;
            })
          }
          className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
          placeholder="Grades 1-6"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold">
        Edition label
        <input
          value={content.editionLabel}
          onChange={(event) =>
            onChange((draft) => {
              draft.editionLabel = event.target.value;
            })
          }
          className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex items-start gap-2 rounded-[12px] border border-[#d8c8ae] bg-white p-3 text-sm">
        <input
          type="checkbox"
          checked={content.isCore}
          onChange={(event) =>
            onChange((draft) => {
              draft.isCore = event.target.checked;
            })
          }
          className="mt-1"
        />
        <span>
          <strong className="block">Core curriculum badge</strong>
          <span className="text-xs text-ink/50">
            Elective workbooks normally leave this off.
          </span>
        </span>
      </label>
      <div className="rounded-[12px] bg-white p-3 text-sm">
        <strong>Cover artwork</strong>
        <p className="mt-1 text-xs leading-5 text-ink/50">
          {detail.project.coverImageObjectPath
            ? detail.project.coverImageAlt ?? "Imported cover artwork"
            : "No cover artwork has been attached."}
        </p>
      </div>
      <div className="rounded-[12px] bg-white p-3 text-sm">
        <strong>Effective theme</strong>
        <div className="mt-2 flex gap-1.5">
          {[
            detail.effectiveTheme.colorInk,
            detail.effectiveTheme.colorEarth,
            detail.effectiveTheme.colorLeaf,
            detail.effectiveTheme.colorLeafDark,
            detail.effectiveTheme.colorCream,
            detail.effectiveTheme.colorSand,
            detail.effectiveTheme.colorCoverAccent,
          ].map((color) => (
            <span
              key={color}
              title={color}
              className="h-7 w-7 rounded-full border border-black/10"
              style={{ background: color }}
            />
          ))}
        </div>
        <label className="mt-3 grid gap-1 text-xs font-bold">
          Theme source
          <select
            value={detail.project.themeOverrideVersionId ?? ""}
            disabled={themePending}
            onChange={(event) => onThemeChange(event.target.value || null)}
            className="rounded-[9px] border border-[#d8c8ae] bg-white px-2 py-2 font-normal"
          >
            <option value="">Curriculum default</option>
            {themes
              .filter((theme) => theme.publishedVersionId)
              .map((theme) => (
                <option key={theme.id} value={theme.publishedVersionId!}>
                  {theme.name} · v{theme.versionNumber}
                </option>
              ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-ink/48">
          Pinned effective version {detail.effectiveTheme.versionNumber}.
          Changing a released workbook’s theme creates a new edition.
        </p>
      </div>
    </div>
  );
}

export function WorkbookStudioEditor({
  detail,
  themes,
  initialChapter = 0,
  initialView = "chapter",
}: {
  detail: WorkbookStudioProjectDetail;
  themes: WorkbookStudioSummary["themes"];
  initialChapter?: number;
  initialView?: "cover" | "chapter";
}) {
  const router = useRouter();
  const [content, setContent] = useState<WorkbookContent>(() =>
    structuredClone(detail.currentRevision!.contentJson),
  );
  const [selected, setSelected] = useState({
    chapter: Math.min(
      Math.max(initialChapter, 0),
      detail.currentRevision!.contentJson.chapters.length - 1,
    ),
    lesson: 0,
  });
  const [editorView, setEditorView] = useState<"cover" | "chapter">(
    initialView,
  );
  const [leftPanel, setLeftPanel] = useState<"lessons" | "elements">(
    "lessons",
  );
  const [editorDrag, setEditorDrag] = useState<WorkbookEditorDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<WorkbookDropTarget | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkbookItemLocation | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lessonPreviewOpen, setLessonPreviewOpen] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const suppressPaletteClickRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const [themePending, startThemeTransition] = useTransition();
  const chapter = content.chapters[selected.chapter] ?? content.chapters[0];
  const lesson = chapter?.lessons[selected.lesson] ?? chapter?.lessons[0];
  const selectedEditorItem = selectedItem
    ? workbookItemArray(lesson, selectedItem)?.[selectedItem.index] ?? null
    : null;
  const issueCount = detail.currentRevision?.validationJson.issues?.length ?? 0;
  const hasCompletedRender = detail.renderRuns.some(
    (run) => run.status === "completed" && Boolean(run.pageCount),
  );
  const coverPreviewUrl = `/api/workbook-studio/cover-preview/${encodeURIComponent(detail.project.id)}`;

  const themeStyle = useMemo(
    () =>
      ({
        "--studio-ink": detail.effectiveTheme.colorInk,
        "--studio-earth": detail.effectiveTheme.colorEarth,
        "--studio-leaf": detail.effectiveTheme.colorLeaf,
        "--studio-leaf-dark": detail.effectiveTheme.colorLeafDark,
        "--studio-cream": detail.effectiveTheme.colorCream,
        "--studio-sand": detail.effectiveTheme.colorSand,
        "--studio-canvas": detail.effectiveTheme.colorCanvas,
      }) as React.CSSProperties,
    [detail.effectiveTheme],
  );

  const editorGridTemplateColumns = `${leftSidebarCollapsed ? 48 : 220}px minmax(0, 1fr) ${rightSidebarCollapsed ? 48 : 300}px`;

  function mutate(mutator: (draft: WorkbookContent) => void) {
    setContent((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setDirty(true);
    setNotice("");
  }

  function mutateLesson(mutator: (draft: WorkbookLessonContent) => void) {
    mutate((draft) =>
      mutator(draft.chapters[selected.chapter].lessons[selected.lesson]),
    );
  }

  function selectEditorItem(location: WorkbookItemLocation) {
    setSelectedItem(location);
    setRightSidebarCollapsed(false);
  }

  function updateSelectedEditorItem(next: WorkbookEditorItem) {
    if (!selectedItem) return;
    mutateLesson((draft) => {
      const items = workbookItemArray(draft, selectedItem);
      if (items?.[selectedItem.index]) items[selectedItem.index] = next;
    });
  }

  function startEditorDrag(
    event: DragEvent<HTMLElement>,
    drag: WorkbookEditorDrag,
  ) {
    event.stopPropagation();
    const copy = drag.mode === "new" || drag.mode === "new_row";
    event.dataTransfer.effectAllowed = copy ? "copy" : "move";
    event.dataTransfer.setData(
      "text/plain",
      copy
        ? `new:workbook-${drag.collection}`
        : `move:workbook-${drag.collection}`,
    );
    if (copy) suppressPaletteClickRef.current = true;
    setEditorDrag(drag);
    setDropTarget(null);
    setSelectedItem(null);
  }

  function endEditorDrag() {
    setEditorDrag(null);
    setDropTarget(null);
    window.setTimeout(() => {
      suppressPaletteClickRef.current = false;
    }, 0);
  }

  function paletteClickWasDrag() {
    if (!suppressPaletteClickRef.current) return false;
    suppressPaletteClickRef.current = false;
    return true;
  }

  function updateDropTarget(target: WorkbookDropTarget) {
    setDropTarget((current) => sameWorkbookDropTarget(current, target) ? current : target);
  }

  function canvasDropTarget(): WorkbookDropTarget | null {
    if (!editorDrag) return null;
    return editorDrag.collection === "learn"
      ? {
          collection: "learn",
          container: "root",
          index: lesson.learnBlocks.length,
        }
      : {
          collection: "exercise",
          container: "root",
          index: lesson.exercises.length,
        };
  }

  function dragOverLessonCanvas(event: DragEvent<HTMLElement>) {
    if (!editorDrag) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-workbook-drop-zone]")
    ) {
      return;
    }
    const target = canvasDropTarget();
    if (!target) return;
    event.preventDefault();
    event.dataTransfer.dropEffect =
      editorDrag.mode === "new" || editorDrag.mode === "new_row"
        ? "copy"
        : "move";
    updateDropTarget(target);
  }

  function dropOnLessonCanvas(event: DragEvent<HTMLElement>) {
    if (!editorDrag) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-workbook-drop-zone]")
    ) {
      return;
    }
    const target = canvasDropTarget();
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    dropEditorItem(target);
  }

  function reorderLessonItems(
    collection: WorkbookDropTarget["collection"],
    sourceIndex: number,
    insertionIndex: number,
  ) {
    setSelectedItem(null);
    mutateLesson((draft) => {
      if (collection === "learn") {
        moveItemAtInsertionPoint(
          draft.learnBlocks,
          sourceIndex,
          draft.learnBlocks,
          insertionIndex,
        );
      } else {
        moveItemAtInsertionPoint(
          draft.exercises,
          sourceIndex,
          draft.exercises,
          insertionIndex,
        );
      }
    });
  }

  function dropEditorItem(target: WorkbookDropTarget) {
    const drag = editorDrag;
    if (!drag || drag.collection !== target.collection) return;
    if (
      drag.mode === "existing"
      && sameWorkbookContainer(drag.source, target)
      && (target.index === drag.source.index || target.index === drag.source.index + 1)
    ) {
      endEditorDrag();
      return;
    }
    mutateLesson((draft) => {
      const targetItems = workbookItemArray(draft, target);
      if (!targetItems) return;
      if (drag.mode === "new_row") {
        if (target.container !== "root") return;
        const destinationIndex = Math.min(
          Math.max(target.index, 0),
          targetItems.length,
        );
        targetItems.splice(
          destinationIndex,
          0,
          makeWorkbookLayoutRow(drag.collection, drag.columnCount),
        );
        return;
      }
      if (drag.mode === "new") {
        const destinationIndex = Math.min(
          Math.max(target.index, 0),
          targetItems.length,
        );
        targetItems.splice(
          destinationIndex,
          0,
          drag.collection === "learn"
            ? makeLearnBlock(drag.blockType)
            : makeExercise(drag.exerciseType),
        );
        return;
      }
      const sourceItems = workbookItemArray(draft, drag.source);
      const sourceItem = sourceItems?.[drag.source.index];
      if (!sourceItems || !sourceItem) return;
      if (target.container === "row" && sourceItem.type === "layout_row") return;
      moveItemAtInsertionPoint(
        sourceItems,
        drag.source.index,
        targetItems,
        target.index,
      );
    });
    endEditorDrag();
    if (drag.mode === "new" || drag.mode === "new_row") {
      selectEditorItem(target);
    }
  }

  function save() {
    setError("");
    startTransition(async () => {
      const result = await saveWorkbookStudioRevisionAction({
        projectId: detail.project.id,
        content,
        changeNotes: "Manual Studio edit",
      });
      if (!result.ok) return setError(result.error);
      setDirty(false);
      setNotice(
        result.classification.classification === "edition"
          ? "Saved. This changes the lesson set, so the next release will be a new edition."
          : "Saved as an immutable revision. The lesson set is unchanged.",
      );
      router.refresh();
    });
  }

  function renderPdf() {
    setError("");
    startTransition(async () => {
      if (dirty) return setError("Save your changes before rendering the PDF.");
      const result = await queueWorkbookStudioRenderAction(detail.project.id);
      if (!result.ok) return setError(result.error);
      setNotice("PDF render queued. This page will refresh while it runs.");
      router.refresh();
    });
  }

  function changeTheme(themeVersionId: string | null) {
    setError("");
    startThemeTransition(async () => {
      const result = await setWorkbookStudioProjectThemeAction(
        detail.project.id,
        themeVersionId,
      );
      if (!result.ok) return setError(result.error);
      setNotice(
        result.jobId
          ? "Theme changed. Because this workbook is already released, a new edition is rendering automatically."
          : "Theme changed for future previews and releases.",
      );
      router.refresh();
    });
  }

  return (
    <div
      style={{
        ...themeStyle,
        gridTemplateColumns: editorGridTemplateColumns,
      }}
      className="grid min-h-0 flex-1"
    >
      <aside className={`overflow-auto border-r border-[#d2c2aa] bg-[#f8f1e5] ${leftSidebarCollapsed ? "p-2" : "p-4"}`}>
        <div className={`flex items-center gap-2 ${leftSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!leftSidebarCollapsed ? <h2 className="text-xs font-black uppercase tracking-[0.13em] text-earth">
            Editor tools
          </h2> : null}
          <button type="button" onClick={() => setLeftSidebarCollapsed((collapsed) => !collapsed)} aria-label={leftSidebarCollapsed ? "Expand editor tools sidebar" : "Collapse editor tools sidebar"} title={leftSidebarCollapsed ? "Expand editor tools sidebar" : "Collapse editor tools sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#bca98a] bg-white text-lg font-black text-earth shadow-sm hover:border-[#739655] hover:text-[#486a38]">{leftSidebarCollapsed ? "›" : "‹"}</button>
        </div>
        {!leftSidebarCollapsed ? editorView === "cover" ? (
          <div className="mt-4">
            <Link
              href={`/admin/workbook-studio/${detail.project.id}#chapters`}
              className="text-xs font-bold text-earth"
            >
              ← Workbook structure
            </Link>
            <div className="mt-4 rounded-[14px] border border-[#b9cfa5] bg-[#edf5e7] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#567b40]">
                Front matter
              </p>
              <p className="mt-1 font-bold">Cover</p>
              <p className="mt-2 text-xs leading-5 text-ink/50">
                Edit cover text directly on the canvas or use the inspector.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedItem(null);
                setEditorView("chapter");
              }}
              className="mt-3 w-full rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-xs font-bold text-earth"
            >
              Open Chapter {selected.chapter + 1}
            </button>
            <div className="mt-5 rounded-[14px] bg-[#efe4d2] p-3 text-xs leading-5 text-ink/58">
              The cover structure comes from the selected theme. Preview shows
              the most recently rendered PDF cover.
            </div>
          </div>
        ) : <>
          <div className="mt-3 grid grid-cols-2 rounded-[12px] border border-[#d8c8ae] bg-white p-1">
            {(["lessons", "elements"] as const).map((panel) => (
              <button
                type="button"
                key={panel}
                onClick={() => setLeftPanel(panel)}
                className={`rounded-[9px] px-2 py-2 text-xs font-bold capitalize ${leftPanel === panel ? "bg-[#e3edd9] text-[#486a38]" : "text-ink/48"}`}
              >
                {panel}
              </button>
            ))}
          </div>

          {leftPanel === "lessons" ? (
            <div className="mt-4">
              <Link
                href={`/admin/workbook-studio/${detail.project.id}#chapters`}
                className="text-xs font-bold text-earth"
              >
                ← Change chapter
              </Link>
              <div className="mt-3 rounded-[14px] border border-[#d8c8ae] bg-white/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.1em] text-ink/40">
                  Chapter {selected.chapter + 1}
                </p>
                <p className="mt-1 text-sm font-bold leading-5">
                  {chapter.title}
                </p>
              </div>
              <div className="mt-3 grid gap-1">
                {chapter.lessons.map((child, lessonIndex) => (
                  <button
                    type="button"
                    key={child.id}
                    onClick={() => {
                      setSelectedItem(null);
                      setSelected({
                        chapter: selected.chapter,
                        lesson: lessonIndex,
                      });
                    }}
                    className={`rounded-[10px] px-3 py-2.5 text-left text-xs ${selected.lesson === lessonIndex ? "bg-[#dfead4] font-bold text-[#486a38]" : "text-ink/58 hover:bg-white"}`}
                  >
                    {selected.chapter + 1}.{lessonIndex + 1} {child.title}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  mutate((draft) => {
                    const number =
                      draft.chapters[selected.chapter].lessons.length + 1;
                    draft.chapters[selected.chapter].lessons.push({
                      id: newStableId(`lesson-${selected.chapter + 1}-${number}`),
                      title: "New lesson",
                      standardsCodes: [],
                      needsIllustration: false,
                      learnBlocks: [
                        { type: "paragraph", text: "Add lesson text." },
                      ],
                      exercises: [makeExercise("short_answer")],
                    });
                    setSelected({
                      chapter: selected.chapter,
                      lesson: number - 1,
                    });
                    setSelectedItem(null);
                  })
                }
                className="mt-3 w-full rounded-[10px] border border-[#bca98a] bg-white px-3 py-2 text-xs font-bold text-earth"
              >
                + Add lesson
              </button>
              <button
                type="button"
                onClick={() =>
                  mutate((draft) => {
                    const chapterNumber = draft.chapters.length + 1;
                    draft.chapters.push({
                      id: newStableId(`chapter-${chapterNumber}`),
                      title: `Chapter ${chapterNumber}`,
                      lessons: [
                        {
                          id: newStableId(`lesson-${chapterNumber}-1`),
                          title: "New lesson",
                          standardsCodes: [],
                          needsIllustration: false,
                          learnBlocks: [
                            { type: "paragraph", text: "Add lesson text." },
                          ],
                          exercises: [makeExercise("short_answer")],
                        },
                      ],
                    });
                    setSelected({ chapter: chapterNumber - 1, lesson: 0 });
                    setSelectedItem(null);
                  })
                }
                className="mt-2 w-full px-3 py-2 text-xs font-bold text-ink/48"
              >
                + New chapter
              </button>
              <div className="mt-5 rounded-[14px] bg-[#efe4d2] p-3 text-xs leading-5 text-ink/58">
                Adding, deleting, or replacing a lesson ID makes the next
                release a new edition.
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-earth">
                  Learning content
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([
                    ["paragraph", "Paragraph"],
                    ["image_asset", "Image"],
                    ["qr_code", "QR code"],
                    ["sound_asset", "Sound"],
                    ["vocabulary_list", "Vocabulary"],
                    ["reading_passage", "Passage"],
                    ["character_practice", "Characters"],
                  ] as Array<[AddableLearnBlockType, string]>).map(
                    ([type, label]) => (
                      <button
                        type="button"
                        draggable
                        key={type}
                        onClick={() => {
                          if (paletteClickWasDrag()) return;
                          const index = lesson.learnBlocks.length;
                          mutateLesson((draft) => {
                            draft.learnBlocks.push(makeLearnBlock(type));
                          });
                          selectEditorItem({
                            collection: "learn",
                            container: "root",
                            index,
                          });
                        }}
                        onDragStart={(event) =>
                          startEditorDrag(event, {
                            collection: "learn",
                            mode: "new",
                            blockType: type,
                          })
                        }
                        onDragEnd={endEditorDrag}
                        title={`Drag ${label} into the lesson`}
                        className="flex cursor-grab items-center gap-2 rounded-[10px] border border-dashed border-[#9fbd89] bg-white px-2.5 py-2.5 text-left text-xs font-bold text-[#486a38] active:cursor-grabbing"
                      >
                        <WorkbookPaletteIcon type={type} />
                        <span>{label}</span>
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-earth">
                  Exercises
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([
                    ["circle_choice", "Circle choice"],
                    ["multiple_choice", "Multiple choice"],
                    ["fill_in_blank", "Fill blank"],
                    ["short_answer", "Short answer"],
                    ["matching", "Matching"],
                    ["write", "Writing"],
                    ["draw_box", "Drawing"],
                  ] as Array<[ExerciseType, string]>).map(([type, label]) => (
                    <button
                      type="button"
                      draggable
                      key={type}
                      onClick={() => {
                        if (paletteClickWasDrag()) return;
                        const index = lesson.exercises.length;
                        mutateLesson((draft) => {
                          draft.exercises.push(makeExercise(type));
                        });
                        selectEditorItem({
                          collection: "exercise",
                          container: "root",
                          index,
                        });
                      }}
                      onDragStart={(event) =>
                        startEditorDrag(event, {
                          collection: "exercise",
                          mode: "new",
                          exerciseType: type,
                        })
                      }
                      onDragEnd={endEditorDrag}
                      title={`Drag ${label} into the lesson`}
                      className="flex cursor-grab items-center gap-2 rounded-[10px] border border-dashed border-[#c2ae8e] bg-white px-2.5 py-2.5 text-left text-xs font-bold text-ink/65 active:cursor-grabbing"
                    >
                      <WorkbookPaletteIcon type={type} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {(["learn", "exercise"] as WorkbookEditorCollection[]).map(
                (collection) => (
                  <div key={collection}>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-earth">
                      {collection === "learn" ? "Learning" : "Exercise"} rows
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {([1, 2, 3, 4] as WorkbookLayoutColumnCount[]).map(
                        (columnCount) => (
                          <button
                            type="button"
                            draggable
                            key={columnCount}
                            onClick={() => {
                              if (paletteClickWasDrag()) return;
                              const index = collection === "learn"
                                ? lesson.learnBlocks.length
                                : lesson.exercises.length;
                              mutateLesson((draft) => {
                                if (collection === "learn") {
                                  draft.learnBlocks.push(
                                    makeWorkbookLayoutRow(
                                      collection,
                                      columnCount,
                                    ) as WorkbookLearnBlock,
                                  );
                                } else {
                                  draft.exercises.push(
                                    makeWorkbookLayoutRow(
                                      collection,
                                      columnCount,
                                    ) as WorkbookExercise,
                                  );
                                }
                              });
                              selectEditorItem({
                                collection,
                                container: "root",
                                index,
                              });
                            }}
                            onDragStart={(event) =>
                              startEditorDrag(event, {
                                collection,
                                mode: "new_row",
                                columnCount,
                              })
                            }
                            onDragEnd={endEditorDrag}
                            title={`Drag a ${columnCount}-column row into the lesson`}
                            className="flex cursor-grab items-center gap-2 rounded-[10px] border border-[#b7cda3] bg-[#edf5e7] px-2.5 py-2 text-left text-xs font-bold text-[#486a38] active:cursor-grabbing"
                          >
                            <WorkbookPaletteIcon columns={columnCount} />
                            <span>{columnCount} col</span>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ),
              )}
              <p className="rounded-[12px] bg-white/65 p-3 text-xs leading-5 text-ink/48">
                Click to append, or drag an element directly into the canvas.
              </p>
            </div>
          )}
        </> : null}
      </aside>

      <section className="min-w-0 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-earth">
              {editorView === "cover" ? "Cover canvas" : "Lesson canvas"}
            </p>
            <p className="mt-1 text-sm text-ink/48">
              Revision {detail.currentRevision!.revisionNumber} ·{" "}
              {detail.currentRevision!.source}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editorView === "cover" ? (
              <button
                type="button"
                onClick={() => {
                  if (dirty) {
                    setError("Save and render your cover changes before previewing them.");
                    return;
                  }
                  if (!hasCompletedRender) {
                    setError("Render the workbook PDF before previewing its cover.");
                    return;
                  }
                  setError("");
                  setPreviewOpen(true);
                }}
                disabled={pending}
                className="cta-button cta-button--outline cta-button--small"
              >
                Preview
              </button>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="cta-button cta-button--dark cta-button--small inline-flex items-center gap-2 disabled:opacity-45"
            >
              {pending ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              ) : null}
              Save revision
            </button>
            {editorView === "chapter" ? (
              <button
                type="button"
                onClick={() => setLessonPreviewOpen(true)}
                disabled={pending}
                className="cta-button cta-button--outline cta-button--small"
              >
                Preview lesson
              </button>
            ) : null}
            <button
              type="button"
              onClick={renderPdf}
              disabled={pending}
              className="cta-button cta-button--outline cta-button--small"
            >
              Render PDF
            </button>
            <button
              type="button"
              onClick={() => setReleaseOpen(true)}
              disabled={dirty || pending}
              className="cta-button cta-button--light cta-button--small"
            >
              Release
            </button>
          </div>
        </div>
        {notice ? (
          <p className="mb-4 rounded-[12px] border border-[#bcd1aa] bg-[#edf5e7] px-4 py-3 text-sm text-[#486a38]">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 rounded-[12px] border border-[#e4b9a9] bg-[#fff0ea] px-4 py-3 text-sm font-semibold text-[#8c3f2f]">
            {error}
          </p>
        ) : null}

        {editorView === "cover" ? (
          <WorkbookCoverCanvas
            content={content}
            detail={detail}
            onChange={mutate}
          />
        ) : (
        <div
          onDragOver={dragOverLessonCanvas}
          onDrop={dropOnLessonCanvas}
          className="mx-auto min-h-[900px] max-w-[800px] rounded-[4px] bg-[var(--studio-canvas)] p-8 text-[var(--studio-ink)] shadow-[0_12px_40px_rgba(70,50,30,0.18)] sm:p-12"
          style={workbookBoxPreviewStyle(
            lesson.boxStyle,
            detail.effectiveTheme.colorLeaf,
          )}
        >
          <input
            value={lesson.title}
            onChange={(event) =>
              mutateLesson((draft) => {
                draft.title = event.target.value;
              })
            }
            className="w-full border-0 border-b-[3px] border-[var(--studio-leaf)] bg-transparent pb-2 text-2xl font-bold text-[var(--studio-leaf-dark)] outline-none"
            aria-label="Lesson title"
          />
          <p className="mt-7 inline-block border-b-2 border-[var(--studio-leaf)] text-sm font-bold text-[var(--studio-leaf-dark)]">
            Part 1: Learn
          </p>
          <div
            className="mt-4 grid gap-3"
            style={workbookBoxPreviewStyle(
              lesson.learnSectionBoxStyle,
              detail.effectiveTheme.colorLeaf,
            )}
          >
            {lesson.learnBlocks.map((block, index) => (
              <div key={index}>
                {editorDrag ? <WorkbookDropZone target={{ collection: "learn", container: "root", index }} drag={editorDrag} active={sameWorkbookDropTarget(dropTarget, { collection: "learn", container: "root", index })} onTarget={updateDropTarget} onDrop={dropEditorItem} /> : null}
                <div
                  onClick={() =>
                    selectEditorItem({
                      collection: "learn",
                      container: "root",
                      index,
                    })
                  }
                  className={`group relative cursor-pointer rounded-[12px] border p-3 transition ${selectedItem?.collection === "learn" && selectedItem.container === "root" && selectedItem.index === index ? "border-[var(--studio-leaf)] ring-2 ring-[var(--studio-leaf)]/20" : "border-[var(--studio-sand)]"} ${editorDrag?.collection === "learn" && editorDrag.mode === "existing" && editorDrag.source.container === "root" && editorDrag.source.index === index ? "opacity-35" : ""}`}
                >
                <div
                  style={workbookBoxPreviewStyle(
                    block.boxStyle,
                    detail.effectiveTheme.colorLeaf,
                  )}
                >
                {block.type === "layout_row" ? (
                  <div>
                    <div
                      className="grid gap-3"
                      style={{
                        gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))`,
                        gap: `${block.columnGap ?? 16}px`,
                      }}
                    >
                      {block.columns.map((column, columnIndex) => (
                        <div
                          key={column.id}
                          className="min-w-0 rounded-[10px] border border-dashed border-[var(--studio-leaf)]/55 bg-white/50 p-2"
                        >
                          {column.blocks.map((child, childIndex) => {
                            const target: WorkbookItemLocation = {
                              collection: "learn",
                              container: "row",
                              rowIndex: index,
                              columnIndex,
                              index: childIndex,
                            };
                            return (
                              <div key={`${column.id}-${childIndex}`}>
                                {editorDrag ? (
                                  <WorkbookDropZone
                                    target={target}
                                    drag={editorDrag}
                                    active={sameWorkbookDropTarget(
                                      dropTarget,
                                      target,
                                    )}
                                    onTarget={updateDropTarget}
                                    onDrop={dropEditorItem}
                                  />
                                ) : null}
                                <div
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    selectEditorItem(target);
                                  }}
                                  className={`group/child relative cursor-pointer rounded-[9px] border bg-white p-2 ${selectedItem && sameWorkbookDropTarget(selectedItem, target) ? "border-[var(--studio-leaf)] ring-2 ring-[var(--studio-leaf)]/20" : "border-[#e2d5c2]"}`}
                                  style={workbookBoxPreviewStyle(
                                    child.boxStyle,
                                    detail.effectiveTheme.colorLeaf,
                                  )}
                                >
                                  <WorkbookLearnLeafPreview
                                    block={child}
                                    projectId={detail.project.id}
                                  />
                                  <div className="absolute right-1 top-1 flex gap-1 rounded bg-white p-0.5 opacity-0 shadow group-hover/child:opacity-100 group-focus-within/child:opacity-100">
                                    <button
                                      type="button"
                                      draggable
                                      onDragStart={(event) =>
                                        startEditorDrag(event, {
                                          collection: "learn",
                                          mode: "existing",
                                          source: target,
                                          isLayoutRow: false,
                                        })
                                      }
                                      onDragEnd={endEditorDrag}
                                      className="cursor-grab px-1 text-xs"
                                      aria-label="Drag column element"
                                    >
                                      ⠿
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedItem(null);
                                        mutateLesson((draft) => {
                                          const row = draft.learnBlocks[index];
                                          if (row?.type === "layout_row") {
                                            row.columns[
                                              columnIndex
                                            ].blocks.splice(childIndex, 1);
                                          }
                                        });
                                      }}
                                      className="px-1 text-[10px] font-bold text-[#8c3f2f]"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {editorDrag ? (() => {
                            const target: WorkbookItemLocation = {
                              collection: "learn",
                              container: "row",
                              rowIndex: index,
                              columnIndex,
                              index: column.blocks.length,
                            };
                            return (
                              <WorkbookDropZone
                                target={target}
                                drag={editorDrag}
                                active={sameWorkbookDropTarget(
                                  dropTarget,
                                  target,
                                )}
                                onTarget={updateDropTarget}
                                onDrop={dropEditorItem}
                              />
                            );
                          })() : null}
                          {!column.blocks.length && !editorDrag ? (
                            <div className="grid min-h-24 place-items-center rounded-[8px] border border-dashed border-ink/20 px-2 text-center text-[10px] text-ink/40">
                              Empty column
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <WorkbookLearnLeafPreview
                    block={block}
                    projectId={detail.project.id}
                  />
                )}
                </div>
                  <div className="absolute right-2 top-2 flex gap-1 rounded-[9px] bg-white p-1 opacity-0 shadow-md transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <button type="button" draggable onDragStart={(event) => startEditorDrag(event, { collection: "learn", mode: "existing", source: { collection: "learn", container: "root", index }, isLayoutRow: block.type === "layout_row" })} onDragEnd={endEditorDrag} className="cursor-grab rounded px-1.5 py-0.5 text-sm text-ink/55 active:cursor-grabbing" aria-label={`Drag learning block ${index + 1}`} title="Drag to reorder">⠿</button>
                    <button type="button" disabled={index === 0} onClick={(event) => { event.stopPropagation(); reorderLessonItems("learn", index, index - 1); }} className="rounded px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-30" aria-label={`Move learning block ${index + 1} earlier`}>↑</button>
                    <button type="button" disabled={index === lesson.learnBlocks.length - 1} onClick={(event) => { event.stopPropagation(); reorderLessonItems("learn", index, index + 2); }} className="rounded px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-30" aria-label={`Move learning block ${index + 1} later`}>↓</button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedItem(null);
                        mutateLesson((draft) => {
                          if (draft.learnBlocks.length > 1)
                            draft.learnBlocks.splice(index, 1);
                        });
                      }}
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-[#8c3f2f]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {editorDrag ? <WorkbookDropZone target={{ collection: "learn", container: "root", index: lesson.learnBlocks.length }} drag={editorDrag} active={sameWorkbookDropTarget(dropTarget, { collection: "learn", container: "root", index: lesson.learnBlocks.length })} onTarget={updateDropTarget} onDrop={dropEditorItem} /> : null}
          </div>
          <p className="mt-8 inline-block border-b-2 border-[var(--studio-leaf)] text-sm font-bold text-[var(--studio-leaf-dark)]">
            Part 2: Practice
          </p>
          <div
            className="mt-4 grid gap-5"
            style={workbookBoxPreviewStyle(
              lesson.practiceSectionBoxStyle,
              detail.effectiveTheme.colorLeaf,
            )}
          >
            {lesson.exercises.map((exercise, index) => (
              <div key={exercise.id}>
                {editorDrag ? <WorkbookDropZone target={{ collection: "exercise", container: "root", index }} drag={editorDrag} active={sameWorkbookDropTarget(dropTarget, { collection: "exercise", container: "root", index })} onTarget={updateDropTarget} onDrop={dropEditorItem} /> : null}
                <div
                  onClick={() =>
                    selectEditorItem({
                      collection: "exercise",
                      container: "root",
                      index,
                    })
                  }
                  className={`cursor-pointer rounded-[12px] border p-3 transition ${selectedItem?.collection === "exercise" && selectedItem.container === "root" && selectedItem.index === index ? "border-[var(--studio-leaf)] ring-2 ring-[var(--studio-leaf)]/20" : "border-[var(--studio-sand)]"} ${editorDrag?.collection === "exercise" && editorDrag.mode === "existing" && editorDrag.source.container === "root" && editorDrag.source.index === index ? "opacity-35" : ""}`}
                >
                <div
                  style={workbookBoxPreviewStyle(
                    exercise.boxStyle,
                    detail.effectiveTheme.colorLeaf,
                  )}
                >
                <div
                  className={`flex flex-wrap items-center gap-2 ${
                    exercise.type === "layout_row"
                      ? "mb-1 justify-end"
                      : "mb-2 justify-between"
                  }`}
                >
                  {exercise.type !== "layout_row" ? (
                    <span className="rounded-full bg-[var(--studio-sand)] px-2 py-1 text-xs font-black text-[var(--studio-leaf-dark)]">
                      Exercise {index + 1}
                    </span>
                  ) : null}
                  <div className="flex items-center gap-1">
                    <button type="button" draggable onDragStart={(event) => startEditorDrag(event, { collection: "exercise", mode: "existing", source: { collection: "exercise", container: "root", index }, isLayoutRow: exercise.type === "layout_row" })} onDragEnd={endEditorDrag} className="cursor-grab rounded border border-[#d8c8ae] bg-white px-2 py-1 text-sm text-ink/55 active:cursor-grabbing" aria-label={`Drag exercise ${index + 1}`} title="Drag to reorder">⠿</button>
                    <button type="button" disabled={index === 0} onClick={(event) => { event.stopPropagation(); reorderLessonItems("exercise", index, index - 1); }} className="rounded border border-[#d8c8ae] bg-white px-2 py-1 text-xs font-bold disabled:opacity-30" aria-label={`Move exercise ${index + 1} earlier`}>↑</button>
                    <button type="button" disabled={index === lesson.exercises.length - 1} onClick={(event) => { event.stopPropagation(); reorderLessonItems("exercise", index, index + 2); }} className="rounded border border-[#d8c8ae] bg-white px-2 py-1 text-xs font-bold disabled:opacity-30" aria-label={`Move exercise ${index + 1} later`}>↓</button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedItem(null);
                        mutateLesson((draft) => {
                          if (draft.exercises.length > 1)
                            draft.exercises.splice(index, 1);
                        });
                      }}
                      className="px-1 py-1 text-[11px] font-bold text-[#8c3f2f]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                {exercise.type === "layout_row" ? (
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns: `repeat(${exercise.columns.length}, minmax(0, 1fr))`,
                      gap: `${exercise.columnGap ?? 16}px`,
                    }}
                  >
                    {exercise.columns.map((column, columnIndex) => (
                      <div
                        key={column.id}
                        className="min-w-0 rounded-[10px] border border-dashed border-[var(--studio-leaf)]/55 bg-white/50 p-2"
                      >
                        {column.exercises.map((child, childIndex) => {
                          const target: WorkbookItemLocation = {
                            collection: "exercise",
                            container: "row",
                            rowIndex: index,
                            columnIndex,
                            index: childIndex,
                          };
                          return (
                            <div key={child.id}>
                              {editorDrag ? (
                                <WorkbookDropZone
                                  target={target}
                                  drag={editorDrag}
                                  active={sameWorkbookDropTarget(
                                    dropTarget,
                                    target,
                                  )}
                                  onTarget={updateDropTarget}
                                  onDrop={dropEditorItem}
                                />
                              ) : null}
                              <div
                                onClick={(event) => {
                                  event.stopPropagation();
                                  selectEditorItem(target);
                                }}
                                className={`group/child relative cursor-pointer rounded-[9px] border bg-white p-2 ${selectedItem && sameWorkbookDropTarget(selectedItem, target) ? "border-[var(--studio-leaf)] ring-2 ring-[var(--studio-leaf)]/20" : "border-[#e2d5c2]"}`}
                                style={workbookBoxPreviewStyle(
                                  child.boxStyle,
                                  detail.effectiveTheme.colorLeaf,
                                )}
                              >
                                <WorkbookExerciseLeafPreview
                                  exercise={child}
                                />
                                <div className="absolute right-1 top-1 flex gap-1 rounded bg-white p-0.5 opacity-0 shadow group-hover/child:opacity-100 group-focus-within/child:opacity-100">
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(event) =>
                                      startEditorDrag(event, {
                                        collection: "exercise",
                                        mode: "existing",
                                        source: target,
                                        isLayoutRow: false,
                                      })
                                    }
                                    onDragEnd={endEditorDrag}
                                    className="cursor-grab px-1 text-xs"
                                    aria-label="Drag column exercise"
                                  >
                                    ⠿
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedItem(null);
                                      mutateLesson((draft) => {
                                        const row = draft.exercises[index];
                                        if (row?.type === "layout_row") {
                                          row.columns[
                                            columnIndex
                                          ].exercises.splice(childIndex, 1);
                                        }
                                      });
                                    }}
                                    className="px-1 text-[10px] font-bold text-[#8c3f2f]"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {editorDrag ? (() => {
                          const target: WorkbookItemLocation = {
                            collection: "exercise",
                            container: "row",
                            rowIndex: index,
                            columnIndex,
                            index: column.exercises.length,
                          };
                          return (
                            <WorkbookDropZone
                              target={target}
                              drag={editorDrag}
                              active={sameWorkbookDropTarget(
                                dropTarget,
                                target,
                              )}
                              onTarget={updateDropTarget}
                              onDrop={dropEditorItem}
                            />
                          );
                        })() : null}
                        {!column.exercises.length && !editorDrag ? (
                          <div className="grid min-h-24 place-items-center rounded-[8px] border border-dashed border-ink/20 px-2 text-center text-[10px] text-ink/40">
                            Empty column
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <WorkbookExerciseLeafPreview
                    exercise={exercise}
                  />
                )}
                </div>
                </div>
              </div>
            ))}
            {editorDrag ? <WorkbookDropZone target={{ collection: "exercise", container: "root", index: lesson.exercises.length }} drag={editorDrag} active={sameWorkbookDropTarget(dropTarget, { collection: "exercise", container: "root", index: lesson.exercises.length })} onTarget={updateDropTarget} onDrop={dropEditorItem} /> : null}
          </div>
        </div>
        )}
      </section>

      <aside className={`overflow-auto border-l border-[#d2c2aa] bg-[#f8f1e5] ${rightSidebarCollapsed ? "p-2" : "p-4"}`}>
        <div className={`flex items-center gap-2 ${rightSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!rightSidebarCollapsed ? <h2 className="text-xs font-black uppercase tracking-[0.13em] text-earth">
          Inspector
          </h2> : null}
          <button type="button" onClick={() => setRightSidebarCollapsed((collapsed) => !collapsed)} aria-label={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} title={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#bca98a] bg-white text-lg font-black text-earth shadow-sm hover:border-[#739655] hover:text-[#486a38]">{rightSidebarCollapsed ? "‹" : "›"}</button>
        </div>
        {!rightSidebarCollapsed ? editorView === "cover" ? (
          <WorkbookCoverInspector
            content={content}
            detail={detail}
            themes={themes}
            themePending={themePending}
            onChange={mutate}
            onThemeChange={changeTheme}
          />
        ) : selectedItem && selectedEditorItem ? (
          <WorkbookItemInspector
            item={selectedEditorItem}
            location={selectedItem}
            projectId={detail.project.id}
            fallbackBorderColor={detail.effectiveTheme.colorLeaf}
            onChange={updateSelectedEditorItem}
            onClear={() => setSelectedItem(null)}
          />
        ) : <div className="mt-4 grid gap-4">
          <label className="grid gap-1 text-xs font-bold">
            Chapter title
            <input
              value={chapter.title}
              onChange={(event) =>
                mutate((draft) => {
                  draft.chapters[selected.chapter].title = event.target.value;
                })
              }
              className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold">
            Stable lesson ID
            <input
              value={lesson.id}
              readOnly
              className="rounded-[10px] border border-[#d8c8ae] bg-[#eee7dc] px-3 py-2 font-mono text-xs text-ink/60"
            />
            <span className="font-normal text-ink/45">
              Changing the lesson set makes a new edition.
            </span>
          </label>
          <label className="grid gap-1 text-xs font-bold">
            Standards codes
            <input
              value={lesson.standardsCodes.join(", ")}
              onChange={(event) =>
                mutateLesson((draft) => {
                  draft.standardsCodes = event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean);
                })
              }
              className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm font-normal"
              placeholder="2.OA.A.1, 2.NBT.B.5"
            />
          </label>
          <WorkbookBoxStyleControls
            label="Lesson page"
            value={lesson.boxStyle}
            fallbackBorderColor={detail.effectiveTheme.colorLeaf}
            onChange={(boxStyle) =>
              mutateLesson((draft) => {
                draft.boxStyle = boxStyle;
              })
            }
          />
          <WorkbookBoxStyleControls
            label="Learn section"
            value={lesson.learnSectionBoxStyle}
            fallbackBorderColor={detail.effectiveTheme.colorLeaf}
            onChange={(boxStyle) =>
              mutateLesson((draft) => {
                draft.learnSectionBoxStyle = boxStyle;
              })
            }
          />
          <WorkbookBoxStyleControls
            label="Practice section"
            value={lesson.practiceSectionBoxStyle}
            fallbackBorderColor={detail.effectiveTheme.colorLeaf}
            onChange={(boxStyle) =>
              mutateLesson((draft) => {
                draft.practiceSectionBoxStyle = boxStyle;
              })
            }
          />
          <label className="flex items-start gap-2 rounded-[12px] border border-[#d8c8ae] bg-white p-3 text-sm">
            <input
              type="checkbox"
              checked={lesson.needsIllustration}
              onChange={(event) =>
                mutateLesson((draft) => {
                  draft.needsIllustration = event.target.checked;
                })
              }
              className="mt-1"
            />
            <span>
              <strong className="block">Illustration required</strong>
              <span className="text-xs text-ink/50">
                Publish validation will block this lesson until an illustration
                block is present.
              </span>
            </span>
          </label>
          <div className="rounded-[12px] bg-white p-3 text-sm">
            <strong>Effective theme</strong>
            <div className="mt-2 flex gap-1.5">
              {[
                detail.effectiveTheme.colorInk,
                detail.effectiveTheme.colorEarth,
                detail.effectiveTheme.colorLeaf,
                detail.effectiveTheme.colorLeafDark,
                detail.effectiveTheme.colorCream,
                detail.effectiveTheme.colorSand,
              ].map((color) => (
                <span
                  key={color}
                  title={color}
                  className="h-7 w-7 rounded-full border border-black/10"
                  style={{ background: color }}
                />
              ))}
            </div>
            <label className="mt-3 grid gap-1 text-xs font-bold">
              Theme source
              <select
                value={detail.project.themeOverrideVersionId ?? ""}
                disabled={themePending}
                onChange={(event) => changeTheme(event.target.value || null)}
                className="rounded-[9px] border border-[#d8c8ae] bg-white px-2 py-2 font-normal"
              >
                <option value="">Curriculum default</option>
                {themes
                  .filter((theme) => theme.publishedVersionId)
                  .map((theme) => (
                    <option key={theme.id} value={theme.publishedVersionId!}>
                      {theme.name} · v{theme.versionNumber}
                    </option>
                  ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-ink/48">
              Pinned effective version {detail.effectiveTheme.versionNumber}.
              Changing a released workbook’s theme creates a new edition.
            </p>
          </div>
          <div className="rounded-[12px] bg-white p-3 text-sm">
            <strong>Validation</strong>
            <p className="mt-1 text-xs text-ink/50">
              {issueCount
                ? `${issueCount} issue${issueCount === 1 ? "" : "s"} on the saved revision`
                : "No saved validation issues"}
            </p>
          </div>
          <div className="rounded-[12px] bg-white p-3 text-sm">
            <strong>Recent renders</strong>
            <div className="mt-2 grid gap-1">
              {detail.renderRuns.slice(0, 4).map((run) => (
                <div
                  key={run.id}
                  className="flex justify-between text-xs text-ink/55"
                >
                  <span className="capitalize">{run.status}</span>
                  <span>{run.pageCount ? `${run.pageCount} pages` : "—"}</span>
                </div>
              ))}
              {!detail.renderRuns.length ? (
                <p className="text-xs text-ink/45">No renders yet.</p>
              ) : null}
            </div>
          </div>
        </div> : null}
      </aside>

      {releaseOpen ? (
        <ReleaseDialog
          projectId={detail.project.id}
          title={detail.project.title}
          onClose={() => setReleaseOpen(false)}
          onDone={(message) => {
            setReleaseOpen(false);
            setNotice(message);
            router.refresh();
          }}
        />
      ) : null}
      {previewOpen ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-[#201a14]/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`${content.subjectLabel} cover preview`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPreviewOpen(false);
          }}
        >
          <div className="flex h-[min(92vh,960px)] w-full max-w-4xl flex-col overflow-hidden rounded-[22px] border border-[#d8c8ae] bg-[#fffaf2] shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-[#d8c8ae] px-4 py-3 sm:px-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-earth">
                  Latest rendered PDF
                </p>
                <h2 className="mt-1 font-semibold">
                  {content.subjectLabel} cover
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={coverPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[10px] border border-[#d8c8ae] bg-white px-3 py-2 text-xs font-bold"
                >
                  Open separately ↗
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-[#d8c8ae] bg-white text-xl text-ink/65"
                  aria-label="Close cover preview"
                >
                  ×
                </button>
              </div>
            </div>
            <iframe
              src={`${coverPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={`${content.subjectLabel} print-ready cover`}
              className="min-h-0 flex-1 bg-[#d8d2c9]"
            />
          </div>
        </div>
      ) : null}
      {lessonPreviewOpen ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-[#201a14]/75 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Lesson ${selected.chapter + 1}.${selected.lesson + 1} browser preview`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target)
              setLessonPreviewOpen(false);
          }}
        >
          <div className="flex items-center justify-between gap-4 border-b border-white/15 bg-[#fffaf2] px-4 py-3 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-earth">
                Browser preview · current draft
              </p>
              <h2 className="mt-1 font-semibold">
                Lesson {selected.chapter + 1}.{selected.lesson + 1} —{" "}
                {lesson.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setLessonPreviewOpen(false)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d8c8ae] bg-white text-xl text-ink/65"
              aria-label="Close lesson preview"
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#d8d2c9] p-3 sm:p-8">
            <WorkbookLessonBrowserPreview
              content={content}
              chapterIndex={selected.chapter}
              lessonIndex={selected.lesson}
              projectId={detail.project.id}
              fallbackBorderColor={detail.effectiveTheme.colorLeaf}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReleaseDialog({
  projectId,
  title,
  onClose,
  onDone,
}: {
  projectId: string;
  title: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#25201b]/45 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        className="w-full max-w-xl rounded-[24px] border border-[#d8c8ae] bg-[#fffaf2] p-6"
        action={(formData) => {
          setError("");
          startTransition(async () => {
            const result = await queueWorkbookStudioReleaseAction({
              projectId,
              description: String(formData.get("description") ?? ""),
              curriculumAreaKey: String(
                formData.get("curriculumAreaKey") ?? "other",
              ),
              type:
                String(formData.get("type")) === "elective"
                  ? "elective"
                  : "core",
              priceInCents: Math.round(Number(formData.get("price")) * 100),
              coverageTags: String(formData.get("coverageTags") ?? "")
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
              forceNewEdition: formData.get("forceNewEdition") === "on",
            });
            if (!result.ok) return setError(result.error);
            onDone(
              `${result.editionLabel} ${result.mode.replaceAll("_", " ")} queued for rendering, indexing, and publication.`,
            );
          });
        }}
      >
        <div className="flex justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-earth">
              Release
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#d8c8ae] px-3 py-1.5 text-sm font-bold"
          >
            Close
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink/55">
          The system will choose revision or edition from stable lesson IDs. A
          theme change always becomes a new edition.
        </p>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm font-bold">
            Bookstore description
            <textarea
              name="description"
              required
              className="min-h-28 rounded-[12px] border border-[#d8c8ae] bg-white p-3 font-normal"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold">
              Curriculum area
              <select
                name="curriculumAreaKey"
                className="rounded-[12px] border border-[#d8c8ae] bg-white px-3 py-2.5 font-normal"
              >
                <option value="mathematics">Mathematics</option>
                <option value="language_arts">Language arts</option>
                <option value="science">Science</option>
                <option value="social_studies">Social studies</option>
                <option value="arts">Arts</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Catalog role
              <select
                name="type"
                className="rounded-[12px] border border-[#d8c8ae] bg-white px-3 py-2.5 font-normal"
              >
                <option value="core">Core</option>
                <option value="elective">Elective</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Price (USD)
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                required
                className="rounded-[12px] border border-[#d8c8ae] bg-white px-3 py-2.5 font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Coverage tags
              <input
                name="coverageTags"
                className="rounded-[12px] border border-[#d8c8ae] bg-white px-3 py-2.5 font-normal"
                placeholder="addition, place value"
              />
            </label>
          </div>
          <label className="flex items-start gap-2 rounded-[12px] border border-[#d8c8ae] bg-white p-3 text-sm">
            <input name="forceNewEdition" type="checkbox" className="mt-1" />
            <span>
              <strong>Force a new edition</strong>
              <span className="block text-xs text-ink/50">
                Optional. Lesson or theme changes force one automatically.
              </span>
            </span>
          </label>
          {error ? (
            <p className="rounded-[12px] bg-[#fff0ea] px-3 py-2 text-sm text-[#8c3f2f]">
              {error}
            </p>
          ) : null}
          <button
            disabled={pending}
            className="cta-button cta-button--dark inline-flex items-center justify-center gap-2 disabled:opacity-55"
          >
            {pending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : null}
            {pending ? "Queueing…" : "Render and release"}
          </button>
        </div>
      </form>
    </div>
  );
}
