"use client";

import { useMemo, useState } from "react";

export function PointReasonField({
  label,
  frequentReasons,
  commonReasons,
  disabled = false,
}: {
  label: string;
  frequentReasons: string[];
  commonReasons: readonly string[];
  disabled?: boolean;
}) {
  const reasons = useMemo(
    () => Array.from(new Set([...frequentReasons, ...commonReasons])),
    [commonReasons, frequentReasons],
  );
  const [choice, setChoice] = useState(reasons[0] ?? "__custom__");
  const [customReason, setCustomReason] = useState("");
  const submittedReason = choice === "__custom__" ? customReason.trim() : choice;
  const fieldId = `point-reason-${label.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="text-sm font-semibold text-ink">
      <label htmlFor={fieldId}>{label}</label>
      <input type="hidden" name="reason" value={submittedReason} />
      <select
        id={fieldId}
        value={choice}
        disabled={disabled}
        onChange={(event) => setChoice(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white py-3 pl-4 pr-12 text-base outline-none focus:border-[#8f6544] disabled:cursor-not-allowed disabled:border-[#d8d5cf] disabled:bg-[#e9e7e2]"
      >
        {frequentReasons.length > 0 ? (
          <optgroup label="Frequently used">
            {frequentReasons.map((reason) => (
              <option key={`frequent-${reason}`} value={reason}>{reason}</option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label="Common reasons">
          {commonReasons.filter((reason) => !frequentReasons.includes(reason)).map((reason) => (
            <option key={reason} value={reason}>{reason}</option>
          ))}
        </optgroup>
        <option value="__custom__">Type a custom reason…</option>
      </select>
      {choice === "__custom__" ? (
        <label className="mt-3 block text-sm font-semibold text-ink">
          Custom reason
          <input
            type="text"
            maxLength={300}
            required
            disabled={disabled}
            value={customReason}
            onChange={(event) => setCustomReason(event.target.value)}
            placeholder="Type a short reason"
            className="mt-2 min-h-14 w-full rounded-[16px] border border-[#dcc8aa] bg-white px-4 text-base outline-none focus:border-[#8f6544] disabled:cursor-not-allowed disabled:border-[#d8d5cf] disabled:bg-[#e9e7e2]"
          />
        </label>
      ) : null}
    </div>
  );
}
