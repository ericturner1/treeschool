import { getCurrentUser } from "../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";
import { generateAdminWorkbookQrCodePreview } from "../../../../lib/workbook-studio/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return Response.json({ error: "Sign in again to generate workbook QR codes." }, { status: 401 });
  }
  try {
    const input = await request.json() as { data?: unknown };
    return Response.json(await generateAdminWorkbookQrCodePreview({
      userId: user.id,
      data: input.data,
    }));
  } catch (error) {
    return Response.json(
      { error: publicErrorMessage(error, "Could not generate the QR code.") },
      { status: 400 },
    );
  }
}
