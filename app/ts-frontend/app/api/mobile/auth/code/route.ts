import { NextResponse } from "next/server";
import {
  normalizeMobileSignInEmail,
  requestMobileSignInCode,
} from "../../../../../lib/auth/mobile-sign-in";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email = normalizeMobileSignInEmail(body?.email);
  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const result = await requestMobileSignInCode({
      email,
    });
    return result.ok
      ? NextResponse.json({ sent: true })
      : NextResponse.json({ error: result.error }, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: publicErrorMessage(
          error,
          "Could not request the sign-in email.",
        ),
      },
      { status: 503 },
    );
  }
}
