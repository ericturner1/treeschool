export type WorkbookPrerequisiteIdentity = {
  id: string;
  title: string;
  academicStandardKey: string;
  curriculumSubjectId: string | null;
  subjectKey: string;
  languageCode: string;
};

function languageFamily(value: string) {
  return value.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

export function validateWorkbookPrerequisiteCompatibility(
  workbook: WorkbookPrerequisiteIdentity,
  prerequisite: WorkbookPrerequisiteIdentity
) {
  if (workbook.academicStandardKey !== prerequisite.academicStandardKey) {
    throw new Error(
      `“${prerequisite.title}” uses a different academic standard and cannot be the prerequisite for “${workbook.title}”.`
    );
  }
  const sameSubject = workbook.curriculumSubjectId && prerequisite.curriculumSubjectId
    ? workbook.curriculumSubjectId === prerequisite.curriculumSubjectId
    : workbook.subjectKey === prerequisite.subjectKey;
  if (!sameSubject) {
    throw new Error(
      `“${prerequisite.title}” uses a different subject and cannot be the prerequisite for “${workbook.title}”.`
    );
  }
  if (languageFamily(workbook.languageCode) !== languageFamily(prerequisite.languageCode)) {
    throw new Error(
      `“${prerequisite.title}” uses a different language and cannot be the prerequisite for “${workbook.title}”.`
    );
  }
}

export function validateWorkbookBundlePrerequisites(input: {
  workbookIds: string[];
  members: Array<{
    id: string;
    title: string;
    prerequisiteWorkbookId: string | null;
  }>;
}) {
  const positionByWorkbookId = new Map(
    input.workbookIds.map((workbookId, index) => [workbookId, index])
  );
  for (const member of input.members) {
    if (!member.prerequisiteWorkbookId) continue;
    const memberPosition = positionByWorkbookId.get(member.id);
    const prerequisitePosition = positionByWorkbookId.get(member.prerequisiteWorkbookId);
    if (prerequisitePosition == null) {
      throw new Error(
        `“${member.title}” depends on a workbook that is not included in this bundle. Include its prerequisite or correct its “Starts after” setting.`
      );
    }
    if (memberPosition == null || prerequisitePosition >= memberPosition) {
      throw new Error(
        `“${member.title}” must appear after its prerequisite in the bundle order.`
      );
    }
  }
}
