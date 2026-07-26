import Link from "next/link";
import { redirect } from "next/navigation";
import { getFirstGradePostCheckoutOffer } from "../../../lib/billing/server";
import { FirstGradeJapaneseOfferExperience } from "./offer-experience";

type OfferStage = "us" | "ds";

function offerPath(stage: OfferStage, sessionId: string) {
  return `/offers/${stage}/first-grade-japanese?session_id=${encodeURIComponent(sessionId)}`;
}

export async function FirstGradeJapaneseOfferPageContent({
  searchParams,
  stage
}: {
  searchParams: { session_id?: string };
  stage: OfferStage;
}) {
  const sessionId = String(searchParams.session_id ?? "");
  if (!sessionId) redirect("/");

  let data;
  try {
    data = await getFirstGradePostCheckoutOffer({ sessionId });
  } catch {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f7f1e7] px-4 py-10 text-ink">
        <section className="w-full max-w-2xl rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-7 text-center sm:p-10">
          <h1 className="text-3xl font-semibold tracking-[-0.045em]">Your original order is safe.</h1>
          <p className="mt-4 leading-7 text-ink/65">
            We couldn’t open this optional offer. You have not been charged for it.
          </p>
          <Link href="/" className="cta-button cta-button--dark mt-6">Continue to Treeschool</Link>
        </section>
      </main>
    );
  }

  if (
    !data.offer.full ||
    ["accepted", "downsell_accepted", "declined"].includes(data.state)
  ) {
    redirect(data.thankYouPath);
  }

  const isDownsell =
    data.state === "downsell_shown" ||
    (data.state === "checkout_required" && data.selectedVariant === "starter");

  if (stage === "us" && isDownsell) {
    redirect(offerPath("ds", sessionId));
  }
  if (stage === "ds" && !isDownsell) {
    redirect(offerPath("us", sessionId));
  }

  return (
    <main className="min-h-screen bg-[#f7f1e7] px-4 py-4 text-ink sm:px-6 sm:py-8">
      <FirstGradeJapaneseOfferExperience
        data={data}
        initialMode={stage === "ds" ? "starter" : "full"}
      />
    </main>
  );
}
