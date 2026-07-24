"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CurriculumCompletenessDialog } from "../../../components/curriculum-completeness-dialog";
import { PlanCreationProgress } from "../../../components/plan-creation-progress";
import type { CurriculumCompletenessResult } from "../../../lib/curriculum-completeness/server";

export function CurriculumReviewGate({
  intakeId,
  checkoutSessionId,
  materialCount,
  pageCount,
  learningYearId
}: {
  intakeId: string;
  checkoutSessionId: string;
  materialCount?: number;
  pageCount?: number;
  learningYearId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [result, setResult] = useState<CurriculumCompletenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(action: "evaluate" | "approve") {
    const response = await fetch("/api/plan-pack/curriculum-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intakeId, checkoutSessionId, action })
    });
    const payload = await response.json().catch(() => ({})) as CurriculumCompletenessResult & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Could not review the curriculum.");
    return payload;
  }

  async function review() {
    setOpen(true);
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(await request("evaluate"));
      return true;
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review the curriculum.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function reevaluate() {
    const reviewed = await review();
    if (reviewed) router.refresh();
    return reviewed;
  }

  function continueToPlanning() {
    setContinuing(true);
    setOpen(false);
    void request("approve")
      .then(() => router.refresh())
      .catch((approvalError) => {
        setError(approvalError instanceof Error ? approvalError.message : "Could not start plan generation.");
        setContinuing(false);
        setOpen(true);
      });
  }

  return (
    <>
      {continuing ? (
        <div className="mt-5 rounded-[18px] border border-[#c7d7b3] bg-white/60 px-4 py-4">
          <PlanCreationProgress
            progress={{
              stage: "planning",
              percent: 46,
              label: "Preparing your weekly plan…",
              detail: "Treeschool is organizing the reviewed materials into the weekly schedule."
            }}
            compact
          />
        </div>
      ) : (
        <button type="button" onClick={review} className="cta-button cta-button--dark mt-5 w-full">
          Review curriculum and generate plan
        </button>
      )}
      {!continuing ? <CurriculumCompletenessDialog
        open={open && !continuing}
        loading={loading}
        continuing={continuing}
        result={result}
        error={error}
        onClose={() => {
          if (!loading && !continuing) setOpen(false);
        }}
        onContinue={continueToPlanning}
        onReevaluate={reevaluate}
        materialSummary={materialCount != null && pageCount != null
          ? `${materialCount} ${materialCount === 1 ? "material" : "materials"} · ${pageCount.toLocaleString()} uploaded ${pageCount === 1 ? "page" : "pages"}`
          : null}
        learningYearId={learningYearId}
        planPackContext={{ intakeId, checkoutSessionId }}
      /> : null}
    </>
  );
}
