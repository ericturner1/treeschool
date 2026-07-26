import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createPlanPackCheckout } from "../../../lib/plan-pack/server";

type ResumePageProps = {
  searchParams?: {
    intakeId?: string;
    draftKey?: string;
    checkoutKind?: string;
  };
};

function requestOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3100";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export default async function ResumePlanPackCheckoutPage({ searchParams }: ResumePageProps) {
  const intakeId = String(searchParams?.intakeId ?? "").trim();
  const draftKey = String(searchParams?.draftKey ?? "").trim();
  // Explicit legacy links retain their one-time checkout. New or incomplete links
  // always resume into the Single membership funnel.
  const checkoutKind = searchParams?.checkoutKind === "one_time" ? "one_time" as const : "subscription" as const;
  if (!intakeId) redirect("/homeschool-lesson-plan-generator?error=This%20checkout%20link%20is%20incomplete.");

  const origin = requestOrigin();
  const successUrl = `${origin}/homeschool-lesson-plan-generator/upload?intakeId=${encodeURIComponent(intakeId)}&session_id={CHECKOUT_SESSION_ID}${
    draftKey ? `&draftKey=${encodeURIComponent(draftKey)}` : ""
  }`;
  const session = await createPlanPackCheckout({
    intakeId,
    successUrl,
    cancelUrl: `${origin}/homeschool-lesson-plan-generator?checkout=canceled`,
    checkoutKind
  });

  if (!session.url) redirect("/homeschool-lesson-plan-generator?error=Secure%20checkout%20is%20not%20available%20yet.");
  redirect(session.url);
}
