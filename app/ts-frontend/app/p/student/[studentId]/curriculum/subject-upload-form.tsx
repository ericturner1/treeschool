"use client";

import { useState } from "react";
import { uploadPaperPlanDocumentAction } from "./actions";

const ACCEPTED_CURRICULUM_FILES =
  "application/pdf,.pdf,text/plain,text/markdown,.txt,.md,.markdown,.csv,.tsv,image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff";

type SubjectUpload = {
  id: number;
};

export function SubjectUploadForm({
  profileId,
  learningYearId,
  subjectOptions
}: {
  profileId: string;
  learningYearId: string;
  subjectOptions: Array<{
    kind: "system" | "custom";
    id: string;
    label: string;
  }>;
}) {
  const [subjects, setSubjects] = useState<SubjectUpload[]>([{ id: 0 }]);
  const [selectedSubjects, setSelectedSubjects] = useState<Record<number, string>>({});
  const systemOptions = subjectOptions.filter((option) => option.kind === "system");
  const customOptions = subjectOptions.filter((option) => option.kind === "custom");

  function addSubject() {
    setSubjects((current) => [...current, { id: Math.max(...current.map((subject) => subject.id)) + 1 }]);
  }

  function removeSubject(id: number) {
    setSubjects((current) => (current.length === 1 ? current : current.filter((subject) => subject.id !== id)));
  }

  return (
    <form action={uploadPaperPlanDocumentAction} className="mt-6 space-y-5">
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="learningYearId" value={learningYearId} />

      {subjects.map((subject, index) => (
        <section
          key={subject.id}
          className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] p-4"
        >
          <input type="hidden" name="subjectIndexes" value={subject.id} />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-earth">
                Subject {index + 1}
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-ink">
                Files and parent notes
              </h3>
            </div>
            {subjects.length > 1 ? (
              <button
                type="button"
                onClick={() => removeSubject(subject.id)}
                className="text-xs font-semibold text-[#8b3e2f] underline underline-offset-4"
              >
                Remove
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            <label className="block text-sm font-semibold text-ink">
              Subject
              <select
                name={`subjectId-${subject.id}`}
                required
                value={selectedSubjects[subject.id] ?? ""}
                onChange={(event) =>
                  setSelectedSubjects((current) => ({
                    ...current,
                    [subject.id]: event.target.value
                  }))
                }
                className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
              >
                <option value="">Choose a subject…</option>
                {systemOptions.length > 0 ? (
                  <optgroup label="Treeschool subjects">
                    {systemOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {customOptions.length > 0 ? (
                  <optgroup label="Your subjects">
                    {customOptions.map((option) => (
                      <option key={option.id} value={`custom:${option.label}`}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                <option value="__custom__">Other / add a subject label…</option>
              </select>
            </label>

            {selectedSubjects[subject.id] === "__custom__" ? (
              <label className="block text-sm font-semibold text-ink">
                Custom subject label
                <input
                  name={`customSubjectLabel-${subject.id}`}
                  required
                  placeholder="Math, grammar, handwriting..."
                  className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
                />
              </label>
            ) : null}

            <label className="block text-sm font-semibold text-ink">
              Material type
              <select
                name={`documentRole-${subject.id}`}
                defaultValue="student"
                className="mt-2 min-h-14 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544]"
              >
                <option value="student">Student pages</option>
                <option value="teacher">Parent / teacher guide</option>
                <option value="answer_key">Answer key</option>
                <option value="mixed">Mixed material</option>
              </select>
            </label>

            <label className="block text-sm font-semibold text-ink">
              Annotation notes
              <textarea
                name={`subjectNotes-${subject.id}`}
                rows={4}
                placeholder="Examples: use only odd pages, skip review tests, answer key is separate, start after the placement test..."
                className="mt-2 w-full rounded-[18px] border border-[#dcc8aa] bg-white px-4 py-3 text-base outline-none focus:border-[#8f6544]"
              />
            </label>

            <label className="block rounded-[20px] border border-dashed border-[#c8af8b] bg-white px-4 py-5 text-sm font-semibold text-ink">
              <span className="block">Drop files for this subject</span>
              <span className="mt-1 block text-xs font-medium leading-[1.55] text-ink/55">
                PDF, text, or image. You can select more than one corresponding file.
              </span>
              <input
                name={`files-${subject.id}`}
                type="file"
                accept={ACCEPTED_CURRICULUM_FILES}
                multiple
                required
                className="mt-4 block w-full text-sm text-ink file:mr-4 file:rounded-full file:border-0 file:bg-[#7fa15a] file:px-4 file:py-2 file:font-semibold file:text-white"
              />
            </label>
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={addSubject}
        className="w-full rounded-full border border-dashed border-[#8f6544] px-4 py-3 text-sm font-semibold text-earth"
      >
        Add another subject
      </button>

      <button type="submit" className="cta-button cta-button--light w-full">
        Upload files and queue indexing
      </button>
      <p className="text-xs leading-[1.6] text-ink/55">
        After the files are stored, Treeschool reads each PDF. Larger books may take a few minutes;
        this page refreshes automatically while your materials are being prepared.
      </p>
    </form>
  );
}
