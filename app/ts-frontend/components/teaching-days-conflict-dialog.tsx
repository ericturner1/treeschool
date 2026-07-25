"use client";

export function TeachingDaysConflictDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#21170f]/45 p-2 sm:items-center sm:p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="teaching-days-conflict-title"
        className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-4 shadow-2xl sm:rounded-[24px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="teaching-days-conflict-title" className="text-xl font-semibold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full px-2 text-2xl leading-none text-ink/55 hover:bg-white">
            ×
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink/70">{message}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onCancel} className="cta-button cta-button--light cta-button--small">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="cta-button cta-button--dark cta-button--small">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
