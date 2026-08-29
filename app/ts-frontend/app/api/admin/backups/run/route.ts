import { NextResponse } from "next/server";
import { runAdminBackupNow } from "../../../../../lib/admin/server";
import { getCurrentUser } from "../../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  try {
    const payload = await request.json() as { confirmation?: unknown };
    const result = await runAdminBackupNow({
      userId: user.id,
      confirmation: typeof payload.confirmation === "string" ? payload.confirmation : "",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not start the backup.") },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
