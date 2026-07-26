import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sendMagicLink } from "../../../lib/auth/server";
import { completePublicParentBillingCheckout } from "../../../lib/billing/server";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;

  if (!sessionId) {
    return NextResponse.redirect(new URL(
      `/pricing?error=${encodeURIComponent("This checkout confirmation link is incomplete.")}`,
      origin
    ));
  }

  let checkout: Awaited<ReturnType<typeof completePublicParentBillingCheckout>>;
  try {
    checkout = await completePublicParentBillingCheckout({ sessionId });
  } catch {
    return NextResponse.redirect(new URL(
      `/pricing?error=${encodeURIComponent("We received your checkout, but couldn’t finish account setup. Please contact support.")}`,
      origin
    ));
  }

  const next = "/p/dashboard";
  const callback = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
  const signIn = await sendMagicLink(checkout.email, callback, { createUser: true });
  if (!signIn.ok) {
    return NextResponse.redirect(new URL(
      `/signin?email=${encodeURIComponent(checkout.email)}&next=${encodeURIComponent(next)}&error=${encodeURIComponent("Your membership is active, but we couldn’t send the sign-in email. Please try signing in.")}`,
      origin
    ));
  }

  return NextResponse.redirect(new URL(
    `/signin?email=${encodeURIComponent(checkout.email)}&next=${encodeURIComponent(next)}&sent=1&message=${encodeURIComponent("Payment complete. Check your email to open your Treeschool account.")}`,
    origin
  ));
}
