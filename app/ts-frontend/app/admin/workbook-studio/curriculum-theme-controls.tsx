"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { WorkbookStudioSummary } from "../../../lib/workbook-studio/server";
import { setWorkbookStudioCurriculumThemeAction } from "./actions";

export function CurriculumThemeControls({
  curricula,
  themes,
}: {
  curricula: WorkbookStudioSummary["curricula"];
  themes: WorkbookStudioSummary["themes"];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4 grid gap-2">
      {curricula.slice(0, 8).map((curriculum) => (
        <div
          key={curriculum.id}
          className="rounded-[13px] bg-[#f6eddd] px-3 py-2"
        >
          <Link
            href={`/admin/workbook-studio/curricula/${curriculum.id}`}
            className="text-sm font-bold hover:text-earth"
          >
            {curriculum.name} →
          </Link>
          <p className="text-xs text-ink/48">
            Grade {curriculum.gradeLevel} · {curriculum.languageCode} ·{" "}
            {curriculum.status}
          </p>
          <select
            aria-label={`${curriculum.name} default theme`}
            value={curriculum.defaultThemeVersionId}
            disabled={pending}
            onChange={(event) => {
              setMessage("");
              startTransition(async () => {
                const result = await setWorkbookStudioCurriculumThemeAction(
                  curriculum.id,
                  event.target.value,
                );
                if (!result.ok) return setMessage(result.error);
                setMessage(
                  result.batchId
                    ? `Theme applied; ${result.affectedProjects} workbook projects updated and released books are receiving new editions.`
                    : `Theme applied to ${result.affectedProjects} workbook projects.`,
                );
                router.refresh();
              });
            }}
            className="mt-2 w-full rounded-[9px] border border-[#d8c8ae] bg-white px-2 py-1.5 text-xs"
          >
            <option disabled value="">
              Choose default theme
            </option>
            {themes
              .filter((theme) => theme.publishedVersionId)
              .map((theme) => (
                <option key={theme.id} value={theme.publishedVersionId!}>
                  {theme.name} · v{theme.versionNumber}
                </option>
              ))}
          </select>
        </div>
      ))}
      {!curricula.length ? (
        <p className="text-sm text-ink/48">No Studio curricula yet.</p>
      ) : null}
      {message ? (
        <p className="rounded-[10px] bg-white px-3 py-2 text-xs text-ink/60">
          {message}
        </p>
      ) : null}
    </div>
  );
}
