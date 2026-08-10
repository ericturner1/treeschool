import { NextResponse } from "next/server";
import {
  completePlanPackUpload,
  type PlanPackDraft
} from "../../../../lib/plan-pack/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

function isSupportedCurriculumFile(file: File) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type.includes("pdf") ||
    name.endsWith(".pdf") ||
    type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name) ||
    type.startsWith("text/") ||
    /\.(txt|md|markdown|csv|tsv)$/i.test(name)
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const intakeId = String(formData.get("intakeId") ?? "").trim();
    const checkoutSessionId = String(formData.get("checkoutSessionId") ?? "").trim();
    const draft = JSON.parse(String(formData.get("draft") ?? "{}")) as PlanPackDraft;
    const fileDescriptors = JSON.parse(String(formData.get("fileDescriptors") ?? "[]")) as Array<{
      subjectIndex?: number;
    }>;
    const rawFiles = formData.getAll("files");
    const files = rawFiles.filter((file): file is File => file instanceof File && file.size > 0);

    if (!intakeId || !checkoutSessionId) {
      return NextResponse.json(
        { error: "intakeId and checkoutSessionId are required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(draft.subjects) || draft.subjects.length === 0 || files.length === 0) {
      return NextResponse.json(
        { error: "Add at least one curriculum PDF before completing checkout." },
        { status: 400 }
      );
    }

    if (files.some((file) => !isSupportedCurriculumFile(file))) {
      return NextResponse.json(
        { error: "Choose only PDF, text, or image files." },
        { status: 400 }
      );
    }

    const result = await completePlanPackUpload({
      intakeId,
      checkoutSessionId,
      draft,
      files: files.map((file, index) => ({
        subjectIndex: Number(fileDescriptors[index]?.subjectIndex ?? 0),
        file
      }))
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to upload curriculum files.") },
      { status: 400 }
    );
  }
}
