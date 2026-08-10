import { redirect } from "next/navigation";
import { getFirstGradePostCheckoutOffer } from "../../../../lib/billing/server";

export default async function FirstGradeJapaneseOfferCompletePage(
  props: {
    searchParams: Promise<{ source_session_id?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sessionId = String(searchParams.source_session_id ?? "");
  if (!sessionId) redirect("/");
  const data = await getFirstGradePostCheckoutOffer({ sessionId }).catch(() => null);
  redirect(data?.thankYouPath ?? "/");
}
