"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

type StandardLessonPanelProps = {
  standard: {
    id: string;
    title: string;
    description: string | null;
    lessonCount: number;
    queuedLessonCount: number;
    generatingLessonCount: number;
    lessons: Array<{
      id: string;
      title: string;
      status: string;
      profileName: string | null;
      updatedAt: string;
      isQueued: boolean;
      isGenerating: boolean;
      isRetrying: boolean;
      isError: boolean;
    }>;
  };
  returnTo: string;
  labels: {
    standardLabel: string;
    previewLesson: string;
    noLessonsYet: string;
    generating: string;
    needsRetry: string;
    failed: string;
    queued: string;
    notQueued: string;
    lessonSuffix: string;
    lessonsSuffix: string;
    nothingQueued: string;
    queuedSuffix: string;
    studentFallback: string;
  };
};

export function StandardLessonPanel({ standard, returnTo, labels }: StandardLessonPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-[18px] bg-[#fffaf2] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span className="pt-1 text-lg text-earth">{expanded ? "▾" : "▸"}</span>
          <span className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-earth/80">
              {labels.standardLabel}
            </span>
            <span className="mt-1 block text-base font-semibold text-ink">{standard.title}</span>
            {standard.description ? (
              <span className="mt-1 block text-sm leading-[1.7] text-ink/72">{standard.description}</span>
            ) : null}
          </span>
        </button>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-ink">
            {standard.lessonCount} {standard.lessonCount === 1 ? labels.lessonSuffix : labels.lessonsSuffix}
          </p>
          {standard.queuedLessonCount > 0 ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-earth/80">
              {standard.queuedLessonCount} {labels.queuedSuffix}
            </p>
          ) : null}
          {standard.generatingLessonCount > 0 ? (
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#4d6a39]">
              {standard.generatingLessonCount} {labels.generating}
            </p>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-2 border-t border-[#eadfcd] pt-4">
          {standard.lessons.length === 0 ? (
            <p className="text-sm text-ink/65">{labels.noLessonsYet}</p>
          ) : (
            standard.lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#e4d5bd] bg-[#f8f1e4] px-3 py-3"
              >
                <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{lesson.title}</p>
                {lesson.status === "ready" ? (
                  <Link
                    href={`/p/lesson/${lesson.id}?returnTo=${encodeURIComponent(returnTo)}` as Route}
                    className="inline-flex rounded-[999px] border border-[#d6c1a0] bg-white px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink transition-colors hover:border-[#c8af8b] hover:bg-[#f8f1e4]"
                  >
                    {labels.previewLesson}
                  </Link>
                ) : (
                  <span
                    className={`rounded-[999px] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                      lesson.isQueued
                        ? "bg-[#f5decb] text-[#935b31]"
                        : "bg-[#eef5e4] text-[#4d6a39]"
                    }`}
                  >
                    {lesson.isQueued
                      ? labels.queued
                      : lesson.isGenerating
                        ? labels.generating
                        : lesson.isRetrying
                          ? labels.needsRetry
                          : lesson.isError
                            ? labels.failed
                            : labels.queued}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
