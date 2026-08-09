"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  WorkbookContent,
  WorkbookExercise,
  WorkbookStudioProjectDetail,
  WorkbookStudioSummary,
} from "../../../../lib/workbook-studio/server";
import {
  queueWorkbookStudioReleaseAction,
  queueWorkbookStudioRenderAction,
  saveWorkbookStudioRevisionAction,
  setWorkbookStudioProjectThemeAction,
} from "../actions";

type ExerciseType = WorkbookExercise["type"];

function newStableId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function makeExercise(
  type: ExerciseType,
  id = newStableId("exercise"),
): WorkbookExercise {
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

export function WorkbookStudioEditor({
  detail,
  themes,
}: {
  detail: WorkbookStudioProjectDetail;
  themes: WorkbookStudioSummary["themes"];
}) {
  const router = useRouter();
  const [content, setContent] = useState<WorkbookContent>(() =>
    structuredClone(detail.currentRevision!.contentJson),
  );
  const [selected, setSelected] = useState({ chapter: 0, lesson: 0 });
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [releaseOpen, setReleaseOpen] = useState(false);
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

  function mutate(mutator: (draft: WorkbookContent) => void) {
    setContent((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setDirty(true);
    setNotice("");
  }

  function mutateLesson(mutator: (draft: typeof lesson) => void) {
    mutate((draft) =>
      mutator(draft.chapters[selected.chapter].lessons[selected.lesson]),
    );
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
      className="mx-auto grid max-w-[1600px] xl:grid-cols-[270px_minmax(0,1fr)_310px]"
    >
      <aside className="border-b border-[#d2c2aa] bg-[#f8f1e5] p-4 xl:min-h-[calc(100vh-65px)] xl:border-b-0 xl:border-r">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-[0.13em] text-earth">
            Workbook structure
          </h2>
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
              })
            }
            className="rounded-full border border-[#bca98a] bg-white px-2.5 py-1 text-xs font-bold"
          >
            + Chapter
          </button>
        </div>
        <div className="mt-3 grid gap-3">
          {content.chapters.map((item, chapterIndex) => (
            <div
              key={item.id}
              className="rounded-[14px] border border-[#d8c8ae] bg-white/70 p-2"
            >
              <button
                type="button"
                onClick={() =>
                  setSelected({ chapter: chapterIndex, lesson: 0 })
                }
                className="w-full rounded-[9px] px-2 py-1.5 text-left text-sm font-bold"
              >
                {chapterIndex + 1}. {item.title}
              </button>
              <div className="mt-1 grid gap-1">
                {item.lessons.map((child, lessonIndex) => (
                  <button
                    type="button"
                    key={child.id}
                    onClick={() =>
                      setSelected({
                        chapter: chapterIndex,
                        lesson: lessonIndex,
                      })
                    }
                    className={`rounded-[9px] px-3 py-2 text-left text-xs ${selected.chapter === chapterIndex && selected.lesson === lessonIndex ? "bg-[#dfead4] font-bold text-[#486a38]" : "text-ink/58 hover:bg-[#f6eddd]"}`}
                  >
                    {chapterIndex + 1}.{lessonIndex + 1} {child.title}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() =>
                  mutate((draft) => {
                    const number =
                      draft.chapters[chapterIndex].lessons.length + 1;
                    draft.chapters[chapterIndex].lessons.push({
                      id: newStableId(`lesson-${chapterIndex + 1}-${number}`),
                      title: "New lesson",
                      standardsCodes: [],
                      needsIllustration: false,
                      learnBlocks: [
                        { type: "paragraph", text: "Add lesson text." },
                      ],
                      exercises: [makeExercise("short_answer")],
                    });
                    setSelected({ chapter: chapterIndex, lesson: number - 1 });
                  })
                }
                className="mt-1 px-3 py-1 text-[11px] font-bold text-earth"
              >
                + Add lesson
              </button>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-[14px] bg-[#efe4d2] p-3 text-xs leading-5 text-ink/58">
          <strong className="text-ink">Release rule</strong>
          <br />
          PDF page count may change. Adding, deleting, or replacing a lesson ID
          makes a new edition.
        </div>
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

        <div className="mx-auto min-h-[900px] max-w-[800px] rounded-[4px] bg-[var(--studio-canvas)] p-8 text-[var(--studio-ink)] shadow-[0_12px_40px_rgba(70,50,30,0.18)] sm:p-12">
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
          <div className="mt-4 grid gap-3">
            {lesson.learnBlocks.map((block, index) => (
              <div
                key={index}
                className="group relative rounded-[12px] border border-[var(--studio-sand)] p-3"
              >
                {block.type === "paragraph" ? (
                  <textarea
                    value={block.text}
                    onChange={(event) =>
                      mutateLesson((draft) => {
                        const target = draft.learnBlocks[index];
                        if (target.type === "paragraph")
                          target.text = event.target.value;
                      })
                    }
                    className="min-h-24 w-full resize-y bg-transparent leading-7 outline-none"
                  />
                ) : block.type === "callout" ? (
                  <textarea
                    value={block.text}
                    onChange={(event) =>
                      mutateLesson((draft) => {
                        const target = draft.learnBlocks[index];
                        if (target.type === "callout")
                          target.text = event.target.value;
                      })
                    }
                    className="min-h-20 w-full resize-y rounded-[8px] border-2 border-[var(--studio-leaf)] bg-transparent p-3 outline-none"
                  />
                ) : block.type === "vocabulary_list" ? (
                  <div>
                    <strong className="text-xs uppercase tracking-wide text-[var(--studio-leaf-dark)]">
                      Vocabulary
                    </strong>
                    <textarea
                      value={block.entries
                        .map((entry) =>
                          [
                            entry.term,
                            entry.pronunciation ?? "",
                            entry.definition,
                          ].join(" | "),
                        )
                        .join("\n")}
                      onChange={(event) =>
                        mutateLesson((draft) => {
                          const target = draft.learnBlocks[index];
                          if (target.type !== "vocabulary_list") return;
                          target.entries = event.target.value
                            .split("\n")
                            .filter(Boolean)
                            .map((line) => {
                              const [term, pronunciation, definition] =
                                line.split("|");
                              return {
                                term: term?.trim() || "Word",
                                pronunciation:
                                  pronunciation?.trim() || undefined,
                                definition: definition?.trim() || "Definition",
                              };
                            });
                        })
                      }
                      className="mt-2 min-h-28 w-full rounded-[8px] border border-[var(--studio-leaf)] bg-white p-3 text-sm outline-none"
                      aria-label="One vocabulary entry per line: term, pronunciation, definition"
                    />
                  </div>
                ) : block.type === "reading_passage" ? (
                  <div>
                    <strong className="text-xs uppercase tracking-wide text-[var(--studio-leaf-dark)]">
                      Reading passage
                    </strong>
                    <textarea
                      value={block.paragraphs.join("\n\n")}
                      onChange={(event) =>
                        mutateLesson((draft) => {
                          const target = draft.learnBlocks[index];
                          if (target.type === "reading_passage") {
                            target.paragraphs = event.target.value
                              .split(/\n\s*\n/)
                              .map((paragraph) => paragraph.trim())
                              .filter(Boolean);
                          }
                        })
                      }
                      className="mt-2 min-h-40 w-full resize-y rounded-[8px] border border-[var(--studio-leaf)] bg-white p-3 leading-7 outline-none"
                    />
                  </div>
                ) : block.type === "character_practice" ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="grid gap-1 text-xs font-bold">
                      Character
                      <input
                        value={block.character}
                        onChange={(event) =>
                          mutateLesson((draft) => {
                            const target = draft.learnBlocks[index];
                            if (target.type === "character_practice")
                              target.character = event.target.value;
                          })
                        }
                        className="rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 text-2xl"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold">
                      Pronunciation
                      <input
                        value={block.pronunciation ?? ""}
                        onChange={(event) =>
                          mutateLesson((draft) => {
                            const target = draft.learnBlocks[index];
                            if (target.type === "character_practice")
                              target.pronunciation = event.target.value;
                          })
                        }
                        className="rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold">
                      Meaning
                      <input
                        value={block.meaning ?? ""}
                        onChange={(event) =>
                          mutateLesson((draft) => {
                            const target = draft.learnBlocks[index];
                            if (target.type === "character_practice")
                              target.meaning = event.target.value;
                          })
                        }
                        className="rounded-[8px] border border-[#d8c8ae] bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-[10px] bg-[var(--studio-sand)] p-4 text-sm">
                    <strong>
                      {block.type === "illustration"
                        ? `Illustration: ${block.illustrationType}`
                        : "Image asset"}
                    </strong>
                    <p className="mt-1 text-ink/60">
                      {block.type === "illustration"
                        ? block.altText
                        : block.type === "image_asset"
                          ? block.description
                          : "Structured learn block"}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    mutateLesson((draft) => {
                      if (draft.learnBlocks.length > 1)
                        draft.learnBlocks.splice(index, 1);
                    })
                  }
                  className="absolute right-2 top-2 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-[#8c3f2f] opacity-0 shadow group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                mutateLesson((draft) => {
                  draft.learnBlocks.push({
                    type: "paragraph",
                    text: "New learning paragraph.",
                  });
                })
              }
              className="rounded-[10px] border border-dashed border-[var(--studio-leaf)] px-3 py-2 text-xs font-bold text-[var(--studio-leaf-dark)]"
            >
              + Paragraph
            </button>
            <button
              type="button"
              onClick={() =>
                mutateLesson((draft) => {
                  draft.learnBlocks.push({
                    type: "vocabulary_list",
                    title: "Vocabulary",
                    entries: [{ term: "Word", definition: "Definition" }],
                  });
                })
              }
              className="rounded-[10px] border border-dashed border-[var(--studio-leaf)] px-3 py-2 text-xs font-bold text-[var(--studio-leaf-dark)]"
            >
              + Vocabulary
            </button>
            <button
              type="button"
              onClick={() =>
                mutateLesson((draft) => {
                  draft.learnBlocks.push({
                    type: "reading_passage",
                    title: "Passage",
                    paragraphs: ["Write the passage here."],
                  });
                })
              }
              className="rounded-[10px] border border-dashed border-[var(--studio-leaf)] px-3 py-2 text-xs font-bold text-[var(--studio-leaf-dark)]"
            >
              + Passage
            </button>
            <button
              type="button"
              onClick={() =>
                mutateLesson((draft) => {
                  draft.learnBlocks.push({
                    type: "character_practice",
                    character: "字",
                    traceRows: 3,
                  });
                })
              }
              className="rounded-[10px] border border-dashed border-[var(--studio-leaf)] px-3 py-2 text-xs font-bold text-[var(--studio-leaf-dark)]"
            >
              + Character practice
            </button>
          </div>

          <p className="mt-8 inline-block border-b-2 border-[var(--studio-leaf)] text-sm font-bold text-[var(--studio-leaf-dark)]">
            Part 2: Practice
          </p>
          <ol className="mt-4 grid list-decimal gap-5 pl-6">
            {lesson.exercises.map((exercise, index) => (
              <li
                key={exercise.id}
                className="rounded-[12px] border border-[var(--studio-sand)] p-3 pl-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    value={exercise.type}
                    onChange={(event) =>
                      mutateLesson((draft) => {
                        draft.exercises[index] = makeExercise(
                          event.target.value as ExerciseType,
                          exercise.id,
                        );
                      })
                    }
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
                  <button
                    type="button"
                    onClick={() =>
                      mutateLesson((draft) => {
                        if (draft.exercises.length > 1)
                          draft.exercises.splice(index, 1);
                      })
                    }
                    className="text-[11px] font-bold text-[#8c3f2f]"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={exercise.prompt}
                  onChange={(event) =>
                    mutateLesson((draft) => {
                      draft.exercises[index].prompt = event.target.value;
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
                        mutateLesson((draft) => {
                          draft.exercises[index].options = event.target.value
                            .split("\n")
                            .filter(Boolean);
                        })
                      }
                      className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
                      aria-label="One option per line"
                    />
                    <input
                      value={String(exercise.correctAnswer ?? "")}
                      onChange={(event) =>
                        mutateLesson((draft) => {
                          draft.exercises[index].correctAnswer =
                            event.target.value;
                        })
                      }
                      className="rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
                      placeholder="Correct answer"
                    />
                  </div>
                ) : exercise.type === "matching" ? (
                  <textarea
                    value={(exercise.pairs ?? [])
                      .map((pair) => `${pair.left} | ${pair.right}`)
                      .join("\n")}
                    onChange={(event) =>
                      mutateLesson((draft) => {
                        const lines = event.target.value
                          .split("\n")
                          .filter(Boolean);
                        const pairs = lines.map((line, pairIndex) => {
                          const [left, right] = line.split("|");
                          return {
                            id: `${exercise.id}-pair-${pairIndex + 1}`,
                            left: left?.trim() || "Item",
                            right: right?.trim() || "Match",
                          };
                        });
                        draft.exercises[index].pairs = pairs;
                        draft.exercises[index].rightOrder = pairs
                          .map((pair) => pair.id)
                          .reverse();
                      })
                    }
                    className="min-h-24 w-full rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
                  />
                ) : (
                  <input
                    value={String(
                      exercise.sampleAnswer ?? exercise.correctAnswer ?? "",
                    )}
                    onChange={(event) =>
                      mutateLesson((draft) => {
                        if (
                          exercise.type === "write" ||
                          exercise.type === "draw_box"
                        )
                          draft.exercises[index].sampleAnswer =
                            event.target.value;
                        else
                          draft.exercises[index].correctAnswer =
                            event.target.value;
                      })
                    }
                    className="w-full rounded-[8px] border border-[#d8c8ae] bg-white p-2 text-sm"
                    placeholder="Answer"
                  />
                )}
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() =>
              mutateLesson((draft) => {
                draft.exercises.push(makeExercise("short_answer"));
              })
            }
            className="mt-4 rounded-[10px] border border-dashed border-[var(--studio-leaf)] px-3 py-2 text-xs font-bold text-[var(--studio-leaf-dark)]"
          >
            + Exercise
          </button>
        </div>
      </section>

      <aside className="border-t border-[#d2c2aa] bg-[#f8f1e5] p-4 xl:min-h-[calc(100vh-65px)] xl:border-l xl:border-t-0">
        <h2 className="text-xs font-black uppercase tracking-[0.13em] text-earth">
          Inspector
        </h2>
        <div className="mt-4 grid gap-4">
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
        </div>
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
