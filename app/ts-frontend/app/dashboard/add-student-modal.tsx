"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StudentCalendarSetup } from "./student-calendar-setup";

const strengthSubjects = [
  ["mathematics", "Math"],
  ["reading", "Reading"],
  ["writing_grammar", "Writing & grammar"],
  ["science", "Science"],
  ["social_studies", "Social studies"]
] as const;
const strengthChoices = [
  ["needs_support", "Behind his peers"],
  ["about_right", "About right"],
  ["ready_for_challenge", "Ahead of his peers"],
  ["not_sure", "Not sure"]
] as const;

type AddStudentModalProps = {
  action: (formData: FormData) => Promise<{
    ok: boolean;
    error?: string;
    checkoutUrl?: string;
    paymentCopy?: string;
  }>;
  title: string;
  submitLabel: string;
  openLabel: string;
  cancelLabel: string;
  fields: {
    firstName: string;
    birthDate: string;
    gradeLevel: string;
  };
};

export function AddStudentModal({
  action,
  title,
  submitLabel,
  openLabel,
  cancelLabel,
  fields
}: AddStudentModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [checkoutOffer, setCheckoutOffer] = useState<{ url: string; copy: string } | null>(null);
  const [awaitingDashboardToken, setAwaitingDashboardToken] = useState<string | null>(null);
  const busy = submitting || awaitingDashboardToken !== null;

  useEffect(() => {
    if (!awaitingDashboardToken || searchParams.get("student_created") !== awaitingDashboardToken) return;
    setOpen(false);
    setAwaitingDashboardToken(null);
    setSubmitting(false);
  }, [awaitingDashboardToken, searchParams]);

  async function submitStudent(formData: FormData) {
    setSubmitting(true);
    setSubmissionError(null);
    try {
      const result = await action(formData);
      if (!result.ok) {
        setSubmissionError(result.error || "The student could not be created. Please try again.");
        return;
      }
      if (result.checkoutUrl) {
        setCheckoutOffer({
          url: result.checkoutUrl,
          copy: result.paymentCopy || "Continue to Stripe to activate this additional student."
        });
        return;
      }
      const token = crypto.randomUUID();
      setAwaitingDashboardToken(token);
      router.replace(`/p/dashboard?message=Child%20record%20created.&student_created=${encodeURIComponent(token)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" className="cta-button cta-button--light cta-button--small w-full" onClick={() => {
        setSubmissionError(null);
        setCheckoutOffer(null);
        setAwaitingDashboardToken(null);
        setOpen(true);
      }}>
        {openLabel}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[rgba(37,32,27,0.42)] p-2 sm:items-center sm:px-4 sm:py-8">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-5 shadow-[0_24px_48px_rgba(37,32,27,0.22)] sm:max-h-[92vh] sm:rounded-[28px] sm:px-6 sm:py-6">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">{title}</h2>
              <button
                type="button"
                aria-label={cancelLabel}
                disabled={busy}
                className="rounded-full px-3 py-1 text-2xl font-semibold text-ink/60 transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            {checkoutOffer ? (
              <div className="mt-6">
                <div className="rounded-[20px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-5">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#4d6a39]">Additional student</p>
                  <p className="mt-3 text-base leading-7 text-ink/78">{checkoutOffer.copy}</p>
                </div>
                <p className="mt-4 text-sm leading-6 text-ink/60">
                  You can review the exact charge before paying. Treeschool creates the student profile only after Stripe confirms payment.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="cta-button cta-button--outline cta-button--small"
                    onClick={() => setCheckoutOffer(null)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="cta-button cta-button--light"
                    onClick={() => window.location.assign(checkoutOffer.url)}
                  >
                    Continue to secure checkout
                  </button>
                </div>
              </div>
            ) : (
            <form action={submitStudent} className="mt-6 space-y-5" aria-busy={busy}>
              {submissionError ? (
                <p role="alert" className="rounded-[16px] border border-[#d9afa2] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">
                  {submissionError}
                </p>
              ) : null}
              <div>
                <label htmlFor="modal-firstName" className="text-sm font-semibold text-ink">
                  {fields.firstName}
                </label>
                <input
                  id="modal-firstName"
                  name="firstName"
                  type="text"
                  required
                  disabled={busy}
                  value={studentName}
                  onChange={(event) => setStudentName(event.target.value)}
                  className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base text-ink outline-none transition-colors focus:border-[#8f6544]"
                />
              </div>

              <details className="rounded-[20px] border border-[#d8c7ab] bg-white px-4 py-4">
                <summary className="cursor-pointer list-none font-semibold text-ink">
                  More about {studentName.trim() || "this student"} <span className="font-normal text-ink/55">(optional)</span>
                </summary>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  This helps Treeschool tailor future planning suggestions to the child, without making assumptions from grades alone.
                </p>
                <label htmlFor="modal-learningProfileNotes" className="mt-4 block text-sm font-semibold text-ink">
                  What should Treeschool know?
                </label>
                <textarea
                  id="modal-learningProfileNotes"
                  name="learningProfileNotes"
                  rows={4}
                  maxLength={4000}
                  disabled={busy}
                  placeholder="For example: loves stories, gets frustrated by repetitive math practice, and learns best with short lessons."
                  className="mt-2 w-full rounded-[18px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-3 text-base leading-6 text-ink outline-none transition-colors focus:border-[#8f6544]"
                />
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">Relative strength for their age</p>
                    <p className="mt-1 text-xs leading-5 text-ink/55">Choose Not sure when you do not yet have a strong sense.</p>
                  </div>
                  {strengthSubjects.map(([key, label]) => (
                    <fieldset key={key} disabled={busy}>
                      <legend className="text-sm font-semibold text-ink/75">{label}</legend>
                      <div className="mt-2 grid grid-cols-2 gap-1 rounded-[14px] bg-[#f2eadc] p-1 sm:grid-cols-4">
                        {strengthChoices.map(([value, choiceLabel]) => (
                          <label key={value} className="cursor-pointer">
                            <input
                              type="radio"
                              name={`strength-${key}`}
                              value={value}
                              defaultChecked={value === "not_sure"}
                              className="peer sr-only"
                            />
                            <span className="flex min-h-10 items-center justify-center rounded-[11px] px-2 py-2 text-center text-xs font-semibold text-ink/62 transition peer-checked:bg-white peer-checked:text-[#4f703c] peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-[#7fa35f]">
                              {choiceLabel}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </details>

              <div>
                <label htmlFor="modal-birthDate" className="text-sm font-semibold text-ink">
                  {fields.birthDate}
                </label>
                <input
                  id="modal-birthDate"
                  name="birthDate"
                  type="date"
                  required
                  disabled={busy}
                  value={birthDate}
                  onChange={(event) => setBirthDate(event.target.value)}
                  className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base text-ink outline-none transition-colors focus:border-[#8f6544]"
                />
              </div>

              <div>
                <label htmlFor="modal-gradeLevel" className="text-sm font-semibold text-ink">
                  {fields.gradeLevel}
                </label>
                <select
                  id="modal-gradeLevel"
                  name="gradeLevel"
                  defaultValue=""
                  required
                  disabled={busy}
                  className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white py-3 pl-4 pr-12 text-base text-ink outline-none transition-colors focus:border-[#8f6544]"
                >
                  <option value="" disabled>Select a grade</option>
                  <option value="0">Kindergarten (K)</option>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((grade) => (
                    <option key={grade} value={grade}>Grade {grade}</option>
                  ))}
                </select>
              </div>

              <StudentCalendarSetup
                studentName={studentName}
                birthDate={birthDate}
                disabled={busy}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" disabled={busy} className="cta-button cta-button--outline cta-button--small disabled:cursor-not-allowed disabled:opacity-45" onClick={() => setOpen(false)}>
                  {cancelLabel}
                </button>
                <button type="submit" disabled={busy} className="cta-button cta-button--light disabled:cursor-wait disabled:opacity-75">
                  <span className="inline-flex items-center justify-center gap-2">
                    {busy ? (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                      />
                    ) : null}
                    <span>{busy ? `${submitLabel}…` : submitLabel}</span>
                  </span>
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
