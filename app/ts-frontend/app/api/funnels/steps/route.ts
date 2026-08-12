import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { buildAdminFunnelStepSaveInput } from "../../../../lib/funnels/admin-step-save";
import { saveAdminFunnelStep } from "../../../../lib/funnels/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  try {
    const parsed = buildAdminFunnelStepSaveInput(await request.formData(), user.id);
    const result = await saveAdminFunnelStep(parsed.input);
    revalidatePath("/admin/funnels");
    revalidatePath(`/admin/funnels/${parsed.funnelSlug}`);
    if (result.step.routePath) revalidatePath(result.step.routePath);
    return NextResponse.json({
      ...result,
      message: parsed.id ? "Funnel step updated." : "Funnel step added."
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not save the funnel step.") },
      { status: 400 }
    );
  }
}
