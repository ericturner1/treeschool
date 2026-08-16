"use client";

import { useMemo, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
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
  "paragraph" | "vocabulary_list" | "reading_passage" | "character_practice"
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

function WorkbookLearnLeafFields({
  block,
  onChange,
}: {
  block: WorkbookLearnBlockLeaf;
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
  return (
    <div className="rounded-[10px] bg-[var(--studio-sand)] p-4 text-sm">
      <strong>
        Image asset
      </strong>
      <p className="mt-1 text-ink/60">
        {block.description}
      </p>
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

export function WorkbookStudioEditor({
  detail,
  themes,
  initialChapter = 0,
}: {
  detail: WorkbookStudioProjectDetail;
  themes: WorkbookStudioSummary["themes"];
  initialChapter?: number;
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
  const [leftPanel, setLeftPanel] = useState<"lessons" | "elements">(
    "lessons",
  );
  const [editorDrag, setEditorDrag] = useState<WorkbookEditorDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<WorkbookDropTarget | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [themePending, startThemeTransition] = useTransition();
  const chapter = content.chapters[selected.chapter] ?? content.chapters[0];
  const lesson = chapter?.lessons[selected.lesson] ?? chapter?.lessons[0];
  const issueCount = detail.currentRevision?.validationJson.issues?.length ?? 0;

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

  const editorGridColumns = leftSidebarCollapsed
    ? rightSidebarCollapsed
      ? "xl:grid-cols-[52px_minmax(0,1fr)_52px]"
      : "xl:grid-cols-[52px_minmax(0,1fr)_310px]"
    : rightSidebarCollapsed
      ? "xl:grid-cols-[270px_minmax(0,1fr)_52px]"
      : "xl:grid-cols-[270px_minmax(0,1fr)_310px]";

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
    setEditorDrag(drag);
    setDropTarget(null);
  }

  function endEditorDrag() {
    setEditorDrag(null);
    setDropTarget(null);
  }

  function updateDropTarget(target: WorkbookDropTarget) {
    setDropTarget((current) => sameWorkbookDropTarget(current, target) ? current : target);
  }

  function reorderLessonItems(
    collection: WorkbookDropTarget["collection"],
    sourceIndex: number,
    insertionIndex: number,
  ) {
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
      style={themeStyle}
      className={`mx-auto grid max-w-[1600px] ${editorGridColumns}`}
    >
      <aside className={`border-b border-[#d2c2aa] bg-[#f8f1e5] xl:min-h-[calc(100vh-65px)] xl:border-b-0 xl:border-r ${leftSidebarCollapsed ? "p-2" : "p-4"}`}>
        <div className={`flex items-center gap-2 ${leftSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!leftSidebarCollapsed ? <h2 className="text-xs font-black uppercase tracking-[0.13em] text-earth">
            Editor tools
          </h2> : null}
          <button type="button" onClick={() => setLeftSidebarCollapsed((collapsed) => !collapsed)} aria-label={leftSidebarCollapsed ? "Expand editor tools sidebar" : "Collapse editor tools sidebar"} title={leftSidebarCollapsed ? "Expand editor tools sidebar" : "Collapse editor tools sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#bca98a] bg-white text-lg font-black text-earth shadow-sm hover:border-[#739655] hover:text-[#486a38]">{leftSidebarCollapsed ? "›" : "‹"}</button>
        </div>
        {!leftSidebarCollapsed ? <>
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
                    onClick={() =>
                      setSelected({
                        chapter: selected.chapter,
                        lesson: lessonIndex,
                      })
                    }
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
                    ["vocabulary_list", "Vocabulary"],
                    ["reading_passage", "Passage"],
                    ["character_practice", "Characters"],
                  ] as Array<[AddableLearnBlockType, string]>).map(
                    ([type, label]) => (
                      <button
                        type="button"
                        draggable
                        key={type}
                        onClick={() =>
                          mutateLesson((draft) => {
                            draft.learnBlocks.push(makeLearnBlock(type));
                          })
                        }
                        onDragStart={(event) =>
                          startEditorDrag(event, {
                            collection: "learn",
                            mode: "new",
                            blockType: type,
                          })
                        }
                        onDragEnd={endEditorDrag}
                        className="cursor-grab rounded-[10px] border border-dashed border-[#9fbd89] bg-white px-2 py-2.5 text-xs font-bold text-[#486a38] active:cursor-grabbing"
                      >
                        ⠿ {label}
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
                      onClick={() =>
                        mutateLesson((draft) => {
                          draft.exercises.push(makeExercise(type));
                        })
                      }
                      onDragStart={(event) =>
                        startEditorDrag(event, {
                          collection: "exercise",
                          mode: "new",
                          exerciseType: type,
                        })
                      }
                      onDragEnd={endEditorDrag}
                      className="cursor-grab rounded-[10px] border border-dashed border-[#c2ae8e] bg-white px-2 py-2.5 text-xs font-bold text-ink/65 active:cursor-grabbing"
                    >
                      ⠿ {label}
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
                            onClick={() =>
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
                              })
                            }
                            onDragStart={(event) =>
                              startEditorDrag(event, {
                                collection,
                                mode: "new_row",
                                columnCount,
                              })
                            }
                            onDragEnd={endEditorDrag}
                            className="cursor-grab rounded-[10px] border border-[#b7cda3] bg-[#edf5e7] px-2 py-2 text-xs font-bold text-[#486a38] active:cursor-grabbing"
                          >
                            ⠿ {columnCount} col
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

      <section className="min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-earth">
              Canvas
            </p>
            <p className="mt-1 text-sm text-ink/48">
              Revision {detail.currentRevision!.revisionNumber} ·{" "}
              {detail.currentRevision!.source}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <div
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
                  className={`group relative rounded-[12px] border border-[var(--studio-sand)] p-3 transition ${editorDrag?.collection === "learn" && editorDrag.mode === "existing" && editorDrag.source.container === "root" && editorDrag.source.index === index ? "opacity-35" : ""}`}
                >
                <div
                  style={workbookBoxPreviewStyle(
                    block.boxStyle,
                    detail.effectiveTheme.colorLeaf,
                  )}
                >
                {block.type === "layout_row" ? (
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <strong className="text-xs uppercase tracking-wide text-[var(--studio-leaf-dark)]">
                        {block.columns.length}-column row
                      </strong>
                      <span className="text-[10px] text-ink/45">
                        Drag learning elements into a column
                      </span>
                    </div>
                    <div
                      className="grid gap-3"
                      style={{
                        gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))`,
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
                                  className="group/child relative rounded-[9px] border border-[#e2d5c2] bg-white p-2"
                                  style={workbookBoxPreviewStyle(
                                    child.boxStyle,
                                    detail.effectiveTheme.colorLeaf,
                                  )}
                                >
                                  <WorkbookLearnLeafFields
                                    block={child}
                                    onChange={(next) =>
                                      mutateLesson((draft) => {
                                        const row = draft.learnBlocks[index];
                                        if (row?.type === "layout_row") {
                                          row.columns[columnIndex].blocks[
                                            childIndex
                                          ] = next;
                                        }
                                      })
                                    }
                                  />
                                  <WorkbookBoxStyleControls
                                    label={`Column ${columnIndex + 1} element ${childIndex + 1}`}
                                    value={child.boxStyle}
                                    fallbackBorderColor={
                                      detail.effectiveTheme.colorLeaf
                                    }
                                    onChange={(boxStyle) =>
                                      mutateLesson((draft) => {
                                        const row = draft.learnBlocks[index];
                                        if (row?.type === "layout_row") {
                                          row.columns[columnIndex].blocks[
                                            childIndex
                                          ].boxStyle = boxStyle;
                                        }
                                      })
                                    }
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
                                      onClick={() =>
                                        mutateLesson((draft) => {
                                          const row = draft.learnBlocks[index];
                                          if (row?.type === "layout_row") {
                                            row.columns[
                                              columnIndex
                                            ].blocks.splice(childIndex, 1);
                                          }
                                        })
                                      }
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
                  <WorkbookLearnLeafFields
                    block={block}
                    onChange={(next) =>
                      mutateLesson((draft) => {
                        draft.learnBlocks[index] = next;
                      })
                    }
                  />
                )}
                </div>
                  <WorkbookBoxStyleControls
                    label={`Learning block ${index + 1}`}
                    value={block.boxStyle}
                    fallbackBorderColor={detail.effectiveTheme.colorLeaf}
                    onChange={(boxStyle) =>
                      mutateLesson((draft) => {
                        draft.learnBlocks[index].boxStyle = boxStyle;
                      })
                    }
                  />
                  <div className="absolute right-2 top-2 flex gap-1 rounded-[9px] bg-white p-1 opacity-0 shadow-md transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <button type="button" draggable onDragStart={(event) => startEditorDrag(event, { collection: "learn", mode: "existing", source: { collection: "learn", container: "root", index }, isLayoutRow: block.type === "layout_row" })} onDragEnd={endEditorDrag} className="cursor-grab rounded px-1.5 py-0.5 text-sm text-ink/55 active:cursor-grabbing" aria-label={`Drag learning block ${index + 1}`} title="Drag to reorder">⠿</button>
                    <button type="button" disabled={index === 0} onClick={() => reorderLessonItems("learn", index, index - 1)} className="rounded px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-30" aria-label={`Move learning block ${index + 1} earlier`}>↑</button>
                    <button type="button" disabled={index === lesson.learnBlocks.length - 1} onClick={() => reorderLessonItems("learn", index, index + 2)} className="rounded px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-30" aria-label={`Move learning block ${index + 1} later`}>↓</button>
                    <button
                      type="button"
                      onClick={() =>
                        mutateLesson((draft) => {
                          if (draft.learnBlocks.length > 1)
                            draft.learnBlocks.splice(index, 1);
                        })
                      }
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
                <div className={`rounded-[12px] border border-[var(--studio-sand)] p-3 transition ${editorDrag?.collection === "exercise" && editorDrag.mode === "existing" && editorDrag.source.container === "root" && editorDrag.source.index === index ? "opacity-35" : ""}`}>
                <div
                  style={workbookBoxPreviewStyle(
                    exercise.boxStyle,
                    detail.effectiveTheme.colorLeaf,
                  )}
                >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-[var(--studio-sand)] px-2 py-1 text-xs font-black text-[var(--studio-leaf-dark)]">
                    {exercise.type === "layout_row"
                      ? `${exercise.columns.length}-column row`
                      : `Exercise ${index + 1}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" draggable onDragStart={(event) => startEditorDrag(event, { collection: "exercise", mode: "existing", source: { collection: "exercise", container: "root", index }, isLayoutRow: exercise.type === "layout_row" })} onDragEnd={endEditorDrag} className="cursor-grab rounded border border-[#d8c8ae] bg-white px-2 py-1 text-sm text-ink/55 active:cursor-grabbing" aria-label={`Drag exercise ${index + 1}`} title="Drag to reorder">⠿</button>
                    <button type="button" disabled={index === 0} onClick={() => reorderLessonItems("exercise", index, index - 1)} className="rounded border border-[#d8c8ae] bg-white px-2 py-1 text-xs font-bold disabled:opacity-30" aria-label={`Move exercise ${index + 1} earlier`}>↑</button>
                    <button type="button" disabled={index === lesson.exercises.length - 1} onClick={() => reorderLessonItems("exercise", index, index + 2)} className="rounded border border-[#d8c8ae] bg-white px-2 py-1 text-xs font-bold disabled:opacity-30" aria-label={`Move exercise ${index + 1} later`}>↓</button>
                    <button
                      type="button"
                      onClick={() =>
                        mutateLesson((draft) => {
                          if (draft.exercises.length > 1)
                            draft.exercises.splice(index, 1);
                        })
                      }
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
                                className="group/child relative rounded-[9px] border border-[#e2d5c2] bg-white p-2"
                                style={workbookBoxPreviewStyle(
                                  child.boxStyle,
                                  detail.effectiveTheme.colorLeaf,
                                )}
                              >
                                <WorkbookExerciseLeafFields
                                  exercise={child}
                                  onChange={(next) =>
                                    mutateLesson((draft) => {
                                      const row = draft.exercises[index];
                                      if (row?.type === "layout_row") {
                                        row.columns[columnIndex].exercises[
                                          childIndex
                                        ] = next;
                                      }
                                    })
                                  }
                                />
                                <WorkbookBoxStyleControls
                                  label={`Column ${columnIndex + 1} exercise ${childIndex + 1}`}
                                  value={child.boxStyle}
                                  fallbackBorderColor={
                                    detail.effectiveTheme.colorLeaf
                                  }
                                  onChange={(boxStyle) =>
                                    mutateLesson((draft) => {
                                      const row = draft.exercises[index];
                                      if (row?.type === "layout_row") {
                                        row.columns[columnIndex].exercises[
                                          childIndex
                                        ].boxStyle = boxStyle;
                                      }
                                    })
                                  }
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
                                    onClick={() =>
                                      mutateLesson((draft) => {
                                        const row = draft.exercises[index];
                                        if (row?.type === "layout_row") {
                                          row.columns[
                                            columnIndex
                                          ].exercises.splice(childIndex, 1);
                                        }
                                      })
                                    }
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
                  <WorkbookExerciseLeafFields
                    exercise={exercise}
                    onChange={(next) =>
                      mutateLesson((draft) => {
                        draft.exercises[index] = next;
                      })
                    }
                  />
                )}
                </div>
                  <WorkbookBoxStyleControls
                    label={`Exercise ${index + 1}`}
                    value={exercise.boxStyle}
                    fallbackBorderColor={detail.effectiveTheme.colorLeaf}
                    onChange={(boxStyle) =>
                      mutateLesson((draft) => {
                        draft.exercises[index].boxStyle = boxStyle;
                      })
                    }
                  />
                </div>
              </div>
            ))}
            {editorDrag ? <WorkbookDropZone target={{ collection: "exercise", container: "root", index: lesson.exercises.length }} drag={editorDrag} active={sameWorkbookDropTarget(dropTarget, { collection: "exercise", container: "root", index: lesson.exercises.length })} onTarget={updateDropTarget} onDrop={dropEditorItem} /> : null}
          </div>
        </div>
      </section>

      <aside className={`border-t border-[#d2c2aa] bg-[#f8f1e5] xl:min-h-[calc(100vh-65px)] xl:border-l xl:border-t-0 ${rightSidebarCollapsed ? "p-2" : "p-4"}`}>
        <div className={`flex items-center gap-2 ${rightSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          {!rightSidebarCollapsed ? <h2 className="text-xs font-black uppercase tracking-[0.13em] text-earth">
          Inspector
          </h2> : null}
          <button type="button" onClick={() => setRightSidebarCollapsed((collapsed) => !collapsed)} aria-label={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} title={rightSidebarCollapsed ? "Expand inspector sidebar" : "Collapse inspector sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#bca98a] bg-white text-lg font-black text-earth shadow-sm hover:border-[#739655] hover:text-[#486a38]">{rightSidebarCollapsed ? "‹" : "›"}</button>
        </div>
        {!rightSidebarCollapsed ? <div className="mt-4 grid gap-4">
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
