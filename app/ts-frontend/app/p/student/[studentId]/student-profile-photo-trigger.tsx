"use client";

export const STUDENT_PROFILE_OPEN_EVENT = "treeschool:open-student-profile";

function openStudentProfile(profileId: string) {
  window.dispatchEvent(new CustomEvent(STUDENT_PROFILE_OPEN_EVENT, { detail: { profileId } }));
}

export function StudentProfilePhotoTrigger({
  profileId,
  studentName,
  children
}: {
  profileId: string;
  studentName: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={`Edit ${studentName}'s profile`}
      title={`Edit ${studentName}'s profile`}
      onClick={() => openStudentProfile(profileId)}
      className="group relative flex-none cursor-pointer rounded-[22px] outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#7fa35f] focus-visible:ring-offset-4"
    >
      {children}
      <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 scale-90 place-items-center rounded-full border-2 border-[#fffaf2] bg-[#789765] text-white opacity-0 shadow-sm transition duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
        </svg>
      </span>
    </button>
  );
}

export function StudentProfileSettingsTrigger({
  profileId,
  studentName
}: {
  profileId: string;
  studentName: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Open ${studentName}'s profile settings`}
      title="Student profile settings"
      onClick={() => openStudentProfile(profileId)}
      className="grid h-8 w-8 flex-none place-items-center rounded-full border border-[#d8d3e1] bg-white text-[#716b7d] transition hover:border-[#aaa2b8] hover:bg-[#eeebf3] hover:text-[#4f495b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b86ad] focus-visible:ring-offset-2"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-[17px] w-[17px]" aria-hidden="true">
        <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.2 7.2 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.25-1.18.58-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.38-2.65a7.2 7.2 0 0 0 1.69-.98l2.49 1c.23.09.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
      </svg>
    </button>
  );
}

export function StudentSchoolYearSettingsTrigger({
  profileId,
  studentName
}: {
  profileId: string;
  studentName: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openStudentProfile(profileId)}
      className="cta-button cta-button--dark cta-button--small mt-4"
    >
      Set school year
      <span aria-hidden="true">→</span>
      <span className="sr-only"> for {studentName}</span>
    </button>
  );
}
