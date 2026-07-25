"use client";

import { GearIcon } from "../../../../components/gear-icon";

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
      <GearIcon className="h-[17px] w-[17px]" />
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
