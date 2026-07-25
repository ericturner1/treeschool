"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import { applySchoolYearStartDateChange } from "../../../../lib/plan-generator-dates";
import { STUDENT_PROFILE_OPEN_EVENT, StudentProfileSettingsTrigger } from "./student-profile-photo-trigger";

const subjects = [
  ["mathematics", "Math"],
  ["reading", "Reading"],
  ["writing_grammar", "Writing & grammar"],
  ["science", "Science"],
  ["social_studies", "Social studies"]
] as const;
const choices = [
  ["needs_support", "Behind his peers"],
  ["about_right", "About right"],
  ["ready_for_challenge", "Ahead of his peers"],
  ["not_sure", "Not sure"]
] as const;
const choiceLabels = Object.fromEntries(choices) as Record<string, string>;
const strengthLevels: Record<string, number> = {
  needs_support: 1,
  about_right: 2,
  ready_for_challenge: 3
};

function strengthBarColor(_value: string) {
  return "bg-[#6f9555]";
}

const STUDENT_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const STUDENT_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CROPPED_PHOTO_SIZE = 800;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function croppedPhotoName(originalName: string) {
  const baseName = originalName.replace(/\.[^.]+$/, "").trim() || "student-photo";
  return `${baseName}-cropped.jpg`;
}

function StudentPhotoCropper({
  file,
  sourceUrl,
  studentName,
  onCancel,
  onApply
}: {
  file: File;
  sourceUrl: string;
  studentName: string;
  onCancel: () => void;
  onApply: (file: File) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  useEffect(() => {
    const image = new window.Image();
    image.onload = () => {
      imageRef.current = image;
      setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => setCropError("This photo could not be opened. Please choose another image.");
    image.src = sourceUrl;
    return () => {
      imageRef.current = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => setViewportSize(viewport.clientWidth);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const baseScale = naturalSize.width > 0 && naturalSize.height > 0 && viewportSize > 0
    ? Math.max(viewportSize / naturalSize.width, viewportSize / naturalSize.height)
    : 1;
  const renderedWidth = naturalSize.width * baseScale * zoom;
  const renderedHeight = naturalSize.height * baseScale * zoom;
  const maxOffsetX = Math.max(0, (renderedWidth - viewportSize) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - viewportSize) / 2);

  useEffect(() => {
    setOffset((current) => ({
      x: clamp(current.x, -maxOffsetX, maxOffsetX),
      y: clamp(current.y, -maxOffsetY, maxOffsetY)
    }));
  }, [maxOffsetX, maxOffsetY]);

  function startDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (!naturalSize.width || processing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y
    };
  }

  function continueDragging(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: clamp(drag.offsetX + event.clientX - drag.x, -maxOffsetX, maxOffsetX),
      y: clamp(drag.offsetY + event.clientY - drag.y, -maxOffsetY, maxOffsetY)
    });
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function applyCrop() {
    const image = imageRef.current;
    if (!image || !viewportSize || !naturalSize.width || !naturalSize.height) {
      setCropError("The photo is still loading. Please try again in a moment.");
      return;
    }
    setProcessing(true);
    setCropError(null);
    try {
      const renderedScale = baseScale * zoom;
      const sourceSize = viewportSize / renderedScale;
      const sourceX = clamp(
        naturalSize.width / 2 - offset.x / renderedScale - sourceSize / 2,
        0,
        Math.max(0, naturalSize.width - sourceSize)
      );
      const sourceY = clamp(
        naturalSize.height / 2 - offset.y / renderedScale - sourceSize / 2,
        0,
        Math.max(0, naturalSize.height - sourceSize)
      );
      const canvas = document.createElement("canvas");
      canvas.width = CROPPED_PHOTO_SIZE;
      canvas.height = CROPPED_PHOTO_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo cropping is not supported in this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error("The cropped photo could not be created.")),
          "image/jpeg",
          0.9
        );
      });
      onApply(new File([blob], croppedPhotoName(file.name), { type: "image/jpeg", lastModified: Date.now() }));
    } catch (caught) {
      setCropError(caught instanceof Error ? caught.message : "The cropped photo could not be created.");
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-start justify-center overflow-y-auto bg-[rgba(37,32,27,0.68)] p-2 sm:items-center sm:px-4 sm:py-6">
      <div role="dialog" aria-modal="true" aria-labelledby="student-photo-crop-title" className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-5 shadow-[0_24px_70px_rgba(37,32,27,0.4)] sm:max-h-[95vh] sm:rounded-[28px] sm:px-8 sm:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="student-photo-crop-title" className="text-[28px] font-semibold tracking-[-0.05em] text-ink">Crop {studentName}&apos;s photo</h2>
            <p className="mt-2 text-sm leading-6 text-ink/62">Drag the photo to position it. The circular guide shows how it will appear.</p>
          </div>
          <button type="button" aria-label="Cancel photo cropping" disabled={processing} onClick={onCancel} className="rounded-full px-3 py-1 text-2xl text-ink/55 hover:text-ink">×</button>
        </div>

        {cropError ? <p role="alert" className="mt-4 rounded-[14px] bg-[#fff0ea] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{cropError}</p> : null}

        <div
          ref={viewportRef}
          onPointerDown={startDragging}
          onPointerMove={continueDragging}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          className={`relative mx-auto mt-6 aspect-square w-full max-w-[360px] touch-none overflow-hidden rounded-[22px] bg-[#ded8ce] bg-no-repeat shadow-inner ${naturalSize.width ? "cursor-grab active:cursor-grabbing" : "cursor-wait"}`}
          style={naturalSize.width ? {
            backgroundImage: `url(${JSON.stringify(sourceUrl)})`,
            backgroundPosition: `calc(50% + ${offset.x}px) calc(50% + ${offset.y}px)`,
            backgroundSize: `${renderedWidth}px ${renderedHeight}px`
          } : undefined}
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-[6%] rounded-full border-2 border-white/95 shadow-[0_0_0_999px_rgba(28,24,20,0.32),0_0_0_1px_rgba(37,32,27,0.2)]" />
          {!naturalSize.width && !cropError ? (
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink/60">Loading photo…</span>
          ) : null}
        </div>

        <label htmlFor="student-photo-zoom" className="mx-auto mt-5 block max-w-[360px] text-sm font-semibold text-ink">
          Zoom
          <div className="mt-2 flex items-center gap-3">
            <span aria-hidden="true" className="text-sm text-ink/50">−</span>
            <input
              id="student-photo-zoom"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={processing || !naturalSize.width}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-[#6f9555]"
            />
            <span aria-hidden="true" className="text-lg text-ink/50">+</span>
          </div>
        </label>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={processing} onClick={onCancel} className="cta-button cta-button--outline cta-button--small">Cancel</button>
          <button type="button" disabled={processing || !naturalSize.width} onClick={applyCrop} className="cta-button cta-button--dark cta-button--small disabled:cursor-wait disabled:opacity-65">
            <span className="inline-flex items-center gap-2">
              {processing ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
              {processing ? "Cropping photo…" : "Use cropped photo"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentPhoto({ studentName, url, className }: { studentName: string; url: string | null; className: string }) {
  return (
    <div
      role="img"
      aria-label={url ? `${studentName}'s private profile photo` : `${studentName}'s profile photo placeholder`}
      className={`flex flex-none items-center justify-center overflow-hidden rounded-full border-2 border-[#c9d9b7] bg-[#e7efdc] bg-cover bg-center font-semibold text-[#4f703c] ${className}`}
      style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
    >
      {!url ? studentName.trim().slice(0, 1).toUpperCase() : null}
    </div>
  );
}

export function StudentLearningProfileSummary({
  profileId,
  studentName,
  subjectStrengths
}: {
  profileId: string;
  studentName: string;
  subjectStrengths: Record<string, string>;
}) {
  const visibleStrengths = subjects.filter(([key]) =>
    subjectStrengths[key] && subjectStrengths[key] !== "not_sure"
  );

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-end gap-4">
        <StudentProfileSettingsTrigger profileId={profileId} studentName={studentName} />
      </div>
      {visibleStrengths.length > 0 ? (
        <div className="mt-2.5 space-y-2">
          {visibleStrengths.map(([key, label]) => {
            const value = subjectStrengths[key];
            const level = strengthLevels[value] ?? 0;
            return (
              <div
                key={key}
                title={`${label}: ${choiceLabels[value]}`}
                className="grid grid-cols-[130px_1fr] items-center gap-2"
              >
                <p className="truncate text-[11px] font-semibold text-[#5d5868]">{label}</p>
                <div
                  className="flex w-[70%] gap-1"
                  role="progressbar"
                  aria-label={`${label}: ${choiceLabels[value]}`}
                  aria-valuemin={1}
                  aria-valuemax={3}
                  aria-valuenow={level}
                  aria-valuetext={choiceLabels[value]}
                >
                  {[1, 2, 3].map((step) => (
                    <span
                      key={step}
                      aria-hidden="true"
                      className={`h-2 flex-1 rounded-full ${step <= level ? strengthBarColor(value) : "bg-[#e3e0e8]"}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs italic text-ink/45">No relative strengths have been set yet.</p>
      )}
    </div>
  );
}

export function StudentLearningProfileCard({
  profileId,
  studentName,
  avatarUrl,
  notes: initialNotes,
  subjectStrengths: initialStrengths,
  schoolYearStartDate: initialSchoolYearStartDate,
  schoolYearEndDate: initialSchoolYearEndDate,
  showSummary = true
}: {
  profileId: string;
  studentName: string;
  avatarUrl: string | null;
  notes: string | null;
  subjectStrengths: Record<string, string>;
  schoolYearStartDate: string | null;
  schoolYearEndDate: string | null;
  showSummary?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [strengths, setStrengths] = useState<Record<string, string>>(() =>
    Object.fromEntries(subjects.map(([key]) => [key, initialStrengths[key] ?? "not_sure"]))
  );
  const [saving, setSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState("Saving…");
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoCropSource, setPhotoCropSource] = useState<{ file: File; url: string } | null>(null);
  const [schoolYearStartDate, setSchoolYearStartDate] = useState(initialSchoolYearStartDate ?? "");
  const [schoolYearEndDate, setSchoolYearEndDate] = useState(initialSchoolYearEndDate ?? "");
  const schoolYearEndSuggestionLockedRef = useRef(Boolean(initialSchoolYearStartDate && initialSchoolYearEndDate));

  useEffect(() => () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  }, [photoPreviewUrl]);

  useEffect(() => () => {
    if (photoCropSource) URL.revokeObjectURL(photoCropSource.url);
  }, [photoCropSource]);

  const openEditor = useCallback(() => {
    setNotes(initialNotes ?? "");
    setStrengths(Object.fromEntries(
      subjects.map(([key]) => [key, initialStrengths[key] ?? "not_sure"])
    ));
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoCropSource(null);
    const initialStart = initialSchoolYearStartDate ?? "";
    const initialEnd = initialSchoolYearEndDate ?? "";
    setSchoolYearStartDate(initialStart);
    setSchoolYearEndDate(initialEnd);
    schoolYearEndSuggestionLockedRef.current = Boolean(initialStart && initialEnd);
    setError(null);
    setEditing(true);
  }, [initialNotes, initialSchoolYearEndDate, initialSchoolYearStartDate, initialStrengths]);

  useEffect(() => {
    function handleProfileOpen(event: Event) {
      const detail = (event as CustomEvent<{ profileId?: string }>).detail;
      if (detail?.profileId === profileId) openEditor();
    }

    window.addEventListener(STUDENT_PROFILE_OPEN_EVENT, handleProfileOpen);
    return () => window.removeEventListener(STUDENT_PROFILE_OPEN_EVENT, handleProfileOpen);
  }, [openEditor, profileId]);

  function closeEditor() {
    if (saving) return;
    setEditing(false);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoCropSource(null);
    setError(null);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError(null);
    if (!file) return;
    if (!STUDENT_PHOTO_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP photo.");
      return;
    }
    if (file.size > STUDENT_PHOTO_MAX_BYTES) {
      setError("Student photos may be up to 8 MB.");
      return;
    }
    setPhotoCropSource({ file, url: URL.createObjectURL(file) });
  }

  function useCroppedPhoto(file: File) {
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoCropSource(null);
  }

  async function saveProfile() {
    let stagedPhoto: { objectPath: string } | null = null;
    setSaving(true);
    setSavingMessage(photoFile ? "Preparing photo…" : "Saving…");
    setError(null);
    try {
      if (Boolean(schoolYearStartDate) !== Boolean(schoolYearEndDate)) {
        throw new Error("Set both the school-year start and end dates.");
      }
      if (schoolYearStartDate && schoolYearEndDate && schoolYearEndDate <= schoolYearStartDate) {
        throw new Error("The school year must end after it starts.");
      }
      if (photoFile) {
        const preparedResponse = await fetch("/api/student-profile-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, contentType: photoFile.type, sizeBytes: photoFile.size })
        });
        const prepared = (await preparedResponse.json().catch(() => null)) as {
          error?: string;
          objectPath?: string;
          uploadUrl?: string;
          contentType?: string;
        } | null;
        if (!preparedResponse.ok || !prepared?.objectPath || !prepared.uploadUrl || !prepared.contentType) {
          throw new Error(prepared?.error ?? "Could not prepare the student photo upload.");
        }
        stagedPhoto = { objectPath: prepared.objectPath };
        setSavingMessage("Uploading photo…");
        const uploadResponse = await fetch(prepared.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": prepared.contentType },
          body: photoFile
        });
        if (!uploadResponse.ok) throw new Error("The student photo could not be uploaded. Please try again.");
      }

      setSavingMessage("Saving profile…");
      const updateSchoolYear = schoolYearStartDate !== (initialSchoolYearStartDate ?? "") ||
        schoolYearEndDate !== (initialSchoolYearEndDate ?? "");
      const response = await fetch("/api/student-learning-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          learningProfileNotes: notes,
          subjectStrengths: strengths,
          schoolYearStartDate: schoolYearStartDate || null,
          schoolYearEndDate: schoolYearEndDate || null,
          updateSchoolYear
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not save these details.");

      if (stagedPhoto) {
        setSavingMessage("Securing photo…");
        const completedResponse = await fetch("/api/student-profile-photo", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, objectPath: stagedPhoto.objectPath })
        });
        const completed = (await completedResponse.json().catch(() => null)) as { error?: string } | null;
        if (!completedResponse.ok) throw new Error(completed?.error ?? "Could not save the student photo.");
        stagedPhoto = null;
      }

      setEditing(false);
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      router.refresh();
    } catch (caught) {
      if (stagedPhoto) {
        await fetch("/api/student-profile-photo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, objectPath: stagedPhoto.objectPath })
        }).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : "Could not save these details.");
    } finally {
      setSaving(false);
      setSavingMessage("Saving…");
    }
  }

  const visibleStrengths = subjects.filter(([key]) =>
    initialStrengths[key] && initialStrengths[key] !== "not_sure"
  );

  return (
    <>
      {showSummary ? <section className="mt-6 rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7a5a3d]">Student profile</p>
            <h3 className="mt-2 text-[24px] font-semibold tracking-[-0.045em] text-ink">More about {studentName}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/62">
              These details help Treeschool make more thoughtful planning suggestions for this student.
            </p>
          </div>
          <button type="button" onClick={openEditor} className="cta-button cta-button--outline cta-button--small flex-none">
            {avatarUrl || initialNotes || visibleStrengths.length > 0 ? "Edit profile" : "Add details"}
          </button>
        </div>
        {initialNotes ? <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-ink/75">{initialNotes}</p> : null}
        {visibleStrengths.length > 0 ? (
          <div className="mt-6 rounded-[20px] border border-[#dfd1bb] bg-white/55 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Relative strengths</p>
              <p className="text-xs text-ink/48">Compared with others their age</p>
            </div>
            <div className="mt-4 space-y-4">
              {visibleStrengths.map(([key, label]) => {
                const value = initialStrengths[key];
                const level = strengthLevels[value] ?? 0;
                return (
                  <div key={key} className="grid gap-2 sm:grid-cols-[140px_minmax(160px,1fr)_150px] sm:items-center sm:gap-4">
                    <span className="text-sm font-semibold text-ink/72">{label}</span>
                    <div
                      className="flex gap-1.5"
                      role="progressbar"
                      aria-label={`${label}: ${choiceLabels[value]}`}
                      aria-valuemin={1}
                      aria-valuemax={3}
                      aria-valuenow={level}
                      aria-valuetext={choiceLabels[value]}
                    >
                      {[1, 2, 3].map((step) => (
                        <span
                          key={step}
                          aria-hidden="true"
                          className={`h-3 flex-1 rounded-full ${step <= level ? strengthBarColor(value) : "bg-[#e8dfd1]"}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-ink/58 sm:text-right">{choiceLabels[value]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : !initialNotes && !avatarUrl ? (
          <p className="mt-5 text-sm italic text-ink/48">No extra learning details have been added yet.</p>
        ) : null}
      </section> : null}

      {editing ? (
        <div className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-[rgba(37,32,27,0.48)] p-2 sm:items-center sm:px-4 sm:py-6">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-4 py-5 shadow-[0_24px_60px_rgba(37,32,27,0.28)] sm:max-h-[92vh] sm:rounded-[28px] sm:px-8 sm:py-6">
            <div className="flex items-start justify-between gap-5">
              <div>
                <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-ink">{studentName}&apos;s settings</h2>
                <p className="mt-2 text-sm leading-6 text-ink/62">Set the school calendar and add learning context for more useful planning.</p>
              </div>
              <button type="button" aria-label="Close" disabled={saving} onClick={closeEditor} className="rounded-full px-3 py-1 text-2xl text-ink/55 hover:text-ink">×</button>
            </div>
            {error ? <p role="alert" className="mt-5 rounded-[14px] bg-[#fff0ea] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{error}</p> : null}
            <div className="mt-6 flex flex-col gap-4 rounded-[20px] border border-[#c9d9b7] bg-[#eef5e4] p-4 sm:flex-row sm:items-center">
              <StudentPhoto studentName={studentName} url={photoPreviewUrl ?? avatarUrl} className="h-24 w-24 text-3xl" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Student photo <span className="font-normal text-ink/50">(optional)</span></p>
                <p className="mt-1 text-sm leading-6 text-ink/62">
                  🔒 Stored privately and securely. Treeschool only shows it in the parent area of your family’s account; it is never made public.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="cta-button cta-button--outline cta-button--small cursor-pointer">
                    {avatarUrl || photoFile ? "Choose another photo" : "Choose photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={saving}
                      onChange={choosePhoto}
                      className="sr-only"
                    />
                  </label>
                  <span className="max-w-xs truncate text-xs text-ink/50">{photoFile ? photoFile.name : "JPEG, PNG, or WebP · up to 8 MB"}</span>
                </div>
              </div>
            </div>
            <section className={`mt-6 rounded-[20px] border p-5 ${schoolYearStartDate && schoolYearEndDate ? "border-[#dcc8aa] bg-white/55" : "border-[#b9cf9f] bg-[#eef5e4]"}`}>
              <div>
                <p className="font-semibold text-ink">School year</p>
                <p className="mt-1 text-sm leading-6 text-ink/58">
                  Treeschool uses these dates to show whether the lesson plan is ahead, on schedule, or behind.
                </p>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">
                  Starts on
                  <input
                    type="date"
                    value={schoolYearStartDate}
                    disabled={saving}
                    onChange={(event) => {
                      const nextStartDate = event.target.value;
                      const nextDates = applySchoolYearStartDateChange({
                        nextStartDate,
                        currentEndDate: schoolYearEndDate,
                        endDateSuggestionLocked: schoolYearEndSuggestionLockedRef.current
                      });
                      setSchoolYearStartDate(nextStartDate);
                      setSchoolYearEndDate(nextDates.endDate);
                      schoolYearEndSuggestionLockedRef.current = nextDates.endDateSuggestionLocked;
                    }}
                    onBlur={() => {
                      if (schoolYearStartDate && schoolYearEndDate) {
                        schoolYearEndSuggestionLockedRef.current = true;
                      }
                    }}
                    className="mt-2 w-full rounded-[15px] border border-[#dcc8aa] bg-white px-4 py-3 text-base text-ink outline-none focus:border-[#8f6544]"
                  />
                </label>
                <label className={`block text-sm font-semibold ${schoolYearStartDate ? "text-ink" : "text-ink/40"}`}>
                  Ends on
                  <input
                    type="date"
                    min={schoolYearStartDate || undefined}
                    value={schoolYearEndDate}
                    disabled={saving || !schoolYearStartDate}
                    onChange={(event) => {
                      schoolYearEndSuggestionLockedRef.current = true;
                      setSchoolYearEndDate(event.target.value);
                    }}
                    className="mt-2 w-full rounded-[15px] border border-[#dcc8aa] bg-white px-4 py-3 text-base text-ink outline-none focus:border-[#8f6544] disabled:cursor-not-allowed disabled:bg-[#f2eee7] disabled:text-ink/35"
                  />
                </label>
              </div>
            </section>
            <label htmlFor="student-profile-notes" className="mt-6 block text-sm font-semibold text-ink">What should Treeschool know?</label>
            <textarea
              id="student-profile-notes"
              rows={5}
              maxLength={4000}
              value={notes}
              disabled={saving}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Interests, learning preferences, challenges, accommodations, or anything else that would help with planning."
              className="mt-2 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 py-3 text-base leading-7 text-ink outline-none focus:border-[#8f6544]"
            />
            <div className="mt-6 space-y-5">
              <div>
                <p className="font-semibold text-ink">Relative strength for their age</p>
                <p className="mt-1 text-sm leading-6 text-ink/55">This is planning context, not a grade or permanent label.</p>
              </div>
              {subjects.map(([key, label]) => (
                <fieldset key={key} disabled={saving}>
                  <legend className="text-sm font-semibold text-ink/75">{label}</legend>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-[15px] bg-[#eee4d4] p-1 sm:grid-cols-4">
                    {choices.map(([value, choiceLabel]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={saving}
                        aria-pressed={strengths[key] === value}
                        onClick={() => setStrengths((current) => ({ ...current, [key]: value }))}
                        className={`min-h-11 rounded-[12px] px-2 py-2 text-xs font-semibold transition ${strengths[key] === value ? "bg-white text-[#4f703c] shadow-sm" : "text-ink/60 hover:bg-white/60"}`}
                      >
                        {choiceLabel}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" disabled={saving} onClick={closeEditor} className="cta-button cta-button--outline cta-button--small">Cancel</button>
              <button type="button" disabled={saving} onClick={saveProfile} className="cta-button cta-button--dark cta-button--small disabled:cursor-wait disabled:opacity-70">
                <span className="inline-flex items-center gap-2">
                  {saving ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
                  {saving ? savingMessage : "Save profile"}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editing && photoCropSource ? (
        <StudentPhotoCropper
          file={photoCropSource.file}
          sourceUrl={photoCropSource.url}
          studentName={studentName}
          onCancel={() => setPhotoCropSource(null)}
          onApply={useCroppedPhoto}
        />
      ) : null}
    </>
  );
}
