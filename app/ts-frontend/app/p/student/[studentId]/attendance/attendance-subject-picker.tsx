"use client";

import { useId, useState } from "react";

type Props = {
  masterSubjects: Array<{
    curriculumSubjectId: string;
    subjectKey: string;
    catalogSubjectKey: string;
    curriculumAreaKey: string;
    subjectLabel: string;
  }>;
  customElectives: Array<{ id: string; label: string }>;
  defaultSelection?: string;
  defaultLabel?: string | null;
};

export function AttendanceSubjectPicker({
  masterSubjects,
  customElectives,
  defaultSelection = "",
  defaultLabel,
}: Props) {
  const selectId = useId();
  const customNameId = useId();
  const [selection, setSelection] = useState(defaultSelection);
  const availableSelections = new Set([
    ...masterSubjects.map((subject) => subject.subjectKey),
    ...customElectives.map((elective) => `custom_elective:${elective.id}`),
  ]);
  const previousSelection = defaultSelection && !availableSelections.has(defaultSelection)
    ? { value: defaultSelection, label: defaultLabel?.trim() || "Previous subject" }
    : null;

  return (
    <div className="text-sm font-semibold text-ink">
      <label htmlFor={selectId}>Counts toward</label>
      <select
        id={selectId}
        name="subjectSelection"
        required
        value={selection}
        onChange={(event) => setSelection(event.target.value)}
        className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5"
      >
        <option value="" disabled>Choose a subject</option>
        {masterSubjects.length > 0 ? (
          <optgroup label="Current workbook subjects">
            {masterSubjects.map((subject) => (
              <option key={subject.subjectKey} value={subject.subjectKey}>
                {subject.subjectLabel}
              </option>
            ))}
          </optgroup>
        ) : null}
        {customElectives.length > 0 ? (
          <optgroup label="Custom electives">
            {customElectives.map((elective) => (
              <option key={elective.id} value={`custom_elective:${elective.id}`}>
                {elective.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {previousSelection ? (
          <optgroup label="Previous subject">
            <option value={previousSelection.value}>{previousSelection.label}</option>
          </optgroup>
        ) : null}
        <option value="new_custom">+ Add custom elective…</option>
      </select>
      {selection === "new_custom" ? (
        <label htmlFor={customNameId} className="mt-3 block">
          Custom elective name
          <input
            id={customNameId}
            name="customElectiveName"
            required
            maxLength={120}
            placeholder="Example: Piano"
            className="mt-1.5 w-full rounded-[13px] border border-[#dcc8aa] bg-white px-3 py-2.5"
          />
        </label>
      ) : null}
    </div>
  );
}
