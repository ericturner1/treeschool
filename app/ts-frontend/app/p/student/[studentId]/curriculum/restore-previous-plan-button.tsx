"use client";

export function RestorePreviousPlanButton({
  action,
  profileId,
  learningYearId
}: {
  action: (formData: FormData) => Promise<void>;
  profileId: string;
  learningYearId: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="learningYearId" value={learningYearId} />
      <button
        type="submit"
        onClick={(event) => {
          if (!window.confirm("Restore the previous plan? Started and completed weeks will stay as they are. Future weeks and the material set will return to the prior version.")) {
            event.preventDefault();
          }
        }}
        className="cta-button cta-button--outline cta-button--small"
      >
        Restore previous version
      </button>
    </form>
  );
}
