"use client";

import { useEffect, useState } from "react";
import {
  deleteStoredPlanPackDraft,
  getStoredPlanPackDraft
} from "../plan-pack-draft-storage";
import type { PlanPackDraft } from "../../../lib/plan-pack/server";

type UploadState = "checking" | "uploading" | "missing" | "failed" | "done";

export function StoredPackUploader({
  draftKey,
  intakeId,
  checkoutSessionId,
  draft,
  returnPath
}: {
  draftKey?: string;
  intakeId: string;
  checkoutSessionId: string;
  draft: PlanPackDraft;
  returnPath: string;
}) {
  const [state, setState] = useState<UploadState>(draftKey ? "checking" : "missing");
  const [message, setMessage] = useState("Looking for the PDFs you selected before checkout...");

  useEffect(() => {
    let canceled = false;

    async function uploadStoredFiles() {
      if (!draftKey) {
        setState("missing");
        setMessage("I could not find a pre-checkout browser draft for this purchase.");
        return;
      }

      try {
        const stored = await getStoredPlanPackDraft(draftKey);

        if (canceled) return;

        if (!stored || stored.files.length === 0) {
          setState("missing");
          setMessage("The selected PDFs are not available in this browser. You can attach them again below.");
          return;
        }

        setState("uploading");
        setMessage(`Uploading ${stored.files.length} file${stored.files.length === 1 ? "" : "s"} from this browser...`);

        const prepareResponse = await fetch("/api/plan-pack/uploads/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intakeId,
            checkoutSessionId,
            files: stored.files.map((file, fileIndex) => ({
              subjectIndex: file.subjectIndex,
              fileIndex,
              filename: file.name,
              mimeType: file.type,
              size: file.size
            }))
          })
        });
        const prepared = (await prepareResponse.json().catch(() => null)) as Array<{
          subjectIndex: number;
          fileIndex: number;
          filename: string;
          contentType: string;
          objectPath: string;
          uploadUrl: string;
        }> | { error?: string } | null;
        if (!prepareResponse.ok || !Array.isArray(prepared)) {
          const payload = prepared as { error?: string } | null;
          throw new Error(payload?.error ?? "Could not upload the selected files.");
        }

        for (const upload of prepared) {
          const storedFile = stored.files[upload.fileIndex];
          if (!storedFile) throw new Error("An upload no longer matches its selected file.");
          const uploadResponse = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": upload.contentType },
            body: storedFile.file
          });
          if (!uploadResponse.ok) throw new Error(`Could not upload ${storedFile.name}.`);
        }

        const response = await fetch("/api/plan-pack/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intakeId,
            checkoutSessionId,
            draft,
            files: prepared.map(({ subjectIndex, fileIndex, filename, contentType, objectPath }) => ({
              subjectIndex,
              fileIndex,
              filename,
              mimeType: contentType,
              objectPath
            }))
          })
        });
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "Could not finish the selected uploads.");

        await deleteStoredPlanPackDraft(draftKey);
        localStorage.removeItem("treeschool-plan-pack-form-draft");

        if (!canceled) {
          setState("done");
          setMessage("Files uploaded. Treeschool is processing your printable weeks now.");
          window.location.replace(
            `${returnPath}${returnPath.includes("?") ? "&" : "?"}message=${encodeURIComponent(
              "Files uploaded. Treeschool is processing your printable weeks now."
            )}`
          );
        }
      } catch (error) {
        if (!canceled) {
          setState("failed");
          setMessage(error instanceof Error ? error.message : "Could not upload the selected files.");
        }
      }
    }

    void uploadStoredFiles();

    return () => {
      canceled = true;
    };
  }, [checkoutSessionId, draft, draftKey, intakeId, returnPath]);

  return (
    <div
      className={`mt-7 rounded-[22px] px-5 py-5 text-sm leading-[1.7] ${
        state === "failed"
          ? "border border-[#d9afa2] bg-[#fff1ec] text-[#8b3e2f]"
          : state === "missing"
            ? "border border-[#dcc8aa] bg-[#fffaf2] text-earth"
            : "bg-[#eef5e4] text-[#4d6a39]"
      }`}
    >
      <p className="font-semibold">
        {state === "checking"
          ? "Checking browser storage"
          : state === "uploading"
            ? "Uploading selected files"
            : state === "done"
              ? "Upload complete"
              : state === "missing"
                ? "Files need to be attached again"
                : "Automatic upload did not finish"}
      </p>
      <p className="mt-1">{message}</p>
      {state === "missing" || state === "failed" ? (
        <p className="mt-2 text-xs">
          This can happen if checkout finished in a different browser, private browsing cleared storage, or the browser declined to keep large files.
        </p>
      ) : null}
    </div>
  );
}
