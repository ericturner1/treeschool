"use client";

import { useMemo, useState } from "react";
import type { CurriculumSubjectOption } from "../../../lib/native-workbooks/server";
import { CURRICULUM_AREAS } from "../../../lib/native-workbooks/curriculum-areas";

const CUSTOM_SUBJECT_VALUE = "__custom__";

export function SubjectTaxonomyFields({
  subjects,
  initialCurriculumAreaKey = "",
  initialCurriculumSubjectId = null,
  initialSubjectLabel = ""
}: {
  subjects: CurriculumSubjectOption[];
  initialCurriculumAreaKey?: string;
  initialCurriculumSubjectId?: string | null;
  initialSubjectLabel?: string;
}) {
  const [curriculumAreaKey, setCurriculumAreaKey] = useState(initialCurriculumAreaKey);
  const [subjectSelection, setSubjectSelection] = useState(
    initialCurriculumSubjectId || (initialSubjectLabel ? CUSTOM_SUBJECT_VALUE : "")
  );
  const [customSubject, setCustomSubject] = useState(initialCurriculumSubjectId ? "" : initialSubjectLabel);
  const [addToTaxonomy, setAddToTaxonomy] = useState(false);
  const availableSubjects = useMemo(
    () => subjects.filter((subject) => subject.curriculumAreaKey === curriculumAreaKey),
    [curriculumAreaKey, subjects]
  );
  const isCustom = subjectSelection === CUSTOM_SUBJECT_VALUE;

  return (
    <>
      <label className="grid gap-2 text-sm font-semibold text-ink">
        Curriculum area
        <select
          required
          name="curriculumAreaKey"
          value={curriculumAreaKey}
          onChange={(event) => {
            setCurriculumAreaKey(event.target.value);
            setSubjectSelection("");
            setCustomSubject("");
            setAddToTaxonomy(false);
          }}
          className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12"
        >
          <option value="" disabled>Choose a curriculum area</option>
          {CURRICULUM_AREAS.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}
        </select>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-ink">
        Subject
        <select
          required
          name="curriculumSubjectId"
          value={subjectSelection}
          disabled={!curriculumAreaKey}
          onChange={(event) => {
            setSubjectSelection(event.target.value);
            setAddToTaxonomy(false);
          }}
          className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3 pr-12 disabled:bg-[#f3eee5] disabled:text-ink/45"
        >
          <option value="" disabled>{curriculumAreaKey ? "Choose a subject" : "Choose a curriculum area first"}</option>
          {availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}
          <option value={CUSTOM_SUBJECT_VALUE}>Subject not listed</option>
        </select>
      </label>

      {isCustom ? (
        <div className="grid gap-3 rounded-[16px] border border-[#d7c4a6] bg-white/70 p-4 sm:col-span-2">
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Subject name
            <input
              required
              name="subject"
              maxLength={120}
              value={customSubject}
              onChange={(event) => setCustomSubject(event.target.value)}
              placeholder="Robotics, Logic, Biblical Studies…"
              className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3"
            />
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold text-ink">
            <input
              name="addSubjectToTaxonomy"
              type="checkbox"
              checked={addToTaxonomy}
              onChange={(event) => setAddToTaxonomy(event.target.checked)}
              className="mt-0.5 h-5 w-5 accent-[#678e4d]"
            />
            <span>
              Add this subject to Treeschool’s subject list
              <span className="mt-1 block text-xs font-normal leading-5 text-ink/52">Use this only when the subject should become a reusable choice for future catalog workbooks.</span>
            </span>
          </label>
        </div>
      ) : null}
    </>
  );
}

export function selectedCurriculumSubjectId(formData: FormData) {
  const value = String(formData.get("curriculumSubjectId") ?? "");
  return value && value !== CUSTOM_SUBJECT_VALUE ? value : null;
}
