"use client";

import { type ReactNode, useState } from "react";
import type { NativeWorkbookCatalogItem } from "../../../../../lib/native-workbooks/server";
import { NativeWorkbookChooserDialog } from "./native-workbook-chooser-dialog";

export function LessonPlanEmptyState({
  profileId,
  studentName,
  studentGradeLevel,
  learningYearId,
  preferredPrintPageSize,
  workbooks,
  recommendedCurriculum,
  ownWorkbooksContent,
  addWorkbooksAction,
  purchaseWorkbookAction,
  openNativeInitially = false,
  checkoutCanceled = false
}: {
  profileId: string;
  studentName: string;
  studentGradeLevel: number | null;
  learningYearId?: string | null;
  preferredPrintPageSize?: string | null;
  workbooks: NativeWorkbookCatalogItem[];
  recommendedCurriculum?: NativeWorkbookCatalogItem | null;
  ownWorkbooksContent: ReactNode;
  addWorkbooksAction: (formData: FormData) => Promise<void>;
  purchaseWorkbookAction: (formData: FormData) => Promise<void>;
  openNativeInitially?: boolean;
  checkoutCanceled?: boolean;
}) {
  const [showOwnWorkbooks, setShowOwnWorkbooks] = useState(false);
  const [showNativeWorkbooks, setShowNativeWorkbooks] = useState(openNativeInitially);

  if (showOwnWorkbooks) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setShowOwnWorkbooks(false)} className="text-sm font-semibold text-earth underline underline-offset-4">← Back to workbook choices</button>
        {ownWorkbooksContent}
      </div>
    );
  }

  return (
    <>
      <section className="site-panel rounded-[28px] px-6 py-9 text-center sm:px-10 sm:py-12">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e7f0de] text-[#5f8148]">
          <svg viewBox="0 0 48 48" className="h-9 w-9" fill="none" aria-hidden="true">
            <path d="M9 9h13a6 6 0 0 1 6 6v24H15a6 6 0 0 0-6 6V9Zm30 0H28v30h5a6 6 0 0 1 6 6V9Z" fill="currentColor" opacity=".18" />
            <path d="M9 9h13a6 6 0 0 1 6 6v24H15a6 6 0 0 0-6 6V9Zm30 0H28v30h5a6 6 0 0 1 6 6V9Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-ink">No teaching materials yet</h2>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-ink/62">Start with ready-to-plan Treeschool workbooks, or upload PDF workbooks you already own.</p>
        <div className="mx-auto mt-7 flex max-w-xl flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => setShowNativeWorkbooks(true)} className="cta-button cta-button--dark justify-center">Add Treeschool Workbooks</button>
          <button type="button" onClick={() => setShowOwnWorkbooks(true)} className="cta-button cta-button--light justify-center">Add my own Workbooks</button>
        </div>
      </section>

      {showNativeWorkbooks ? (
        <NativeWorkbookChooserDialog
          profileId={profileId}
          studentName={studentName}
          studentGradeLevel={studentGradeLevel}
          learningYearId={learningYearId}
          preferredPrintPageSize={preferredPrintPageSize}
          workbooks={workbooks}
          recommendedCurriculum={recommendedCurriculum}
          addWorkbooksAction={addWorkbooksAction}
          purchaseWorkbookAction={purchaseWorkbookAction}
          checkoutCanceled={checkoutCanceled}
          onClose={() => setShowNativeWorkbooks(false)}
        />
      ) : null}
    </>
  );
}
