"use client";

import { useState } from "react";
import type { WorkbookStudioSummary } from "../../../lib/workbook-studio/server";

export function WorkbookStandardFields({
  standards,
}: {
  standards: WorkbookStudioSummary["academicStandards"];
}) {
  const initialStandard =
    standards.find((standard) => standard.key === "us") ?? standards[0];
  const [standardKey, setStandardKey] = useState(initialStandard?.key ?? "");
  const [languageCode, setLanguageCode] = useState(
    initialStandard?.defaultLanguageCode ?? "",
  );
  const selectedStandard =
    standards.find((standard) => standard.key === standardKey) ??
    initialStandard;

  return (
    <>
      <label className="grid gap-1.5 text-sm font-bold">
        Academic standard
        <select
          name="academicStandardKey"
          value={standardKey}
          required
          onChange={(event) => {
            const next = standards.find(
              (standard) => standard.key === event.target.value,
            );
            setStandardKey(event.target.value);
            setLanguageCode(next?.defaultLanguageCode ?? "");
          }}
          className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
        >
          {!standards.length ? (
            <option value="">No academic standards configured</option>
          ) : null}
          {standards.map((standard) => (
            <option key={standard.key} value={standard.key}>
              {standard.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-bold">
        Language
        <select
          name="languageCode"
          value={languageCode}
          required
          onChange={(event) => setLanguageCode(event.target.value)}
          className="rounded-[13px] border border-[#d8c8ae] bg-white px-4 py-3 font-normal"
        >
          {(selectedStandard?.languages ?? []).map((language) => (
            <option key={language.code} value={language.code}>
              {language.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
