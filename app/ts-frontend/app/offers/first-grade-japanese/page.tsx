import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Optional Japanese Workbooks | Treeschool",
  referrer: "no-referrer",
  robots: { index: false, follow: false }
};

export default async function FirstGradeJapaneseOfferPage(
  props: {
    searchParams: Promise<{ session_id?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const sessionId = String(searchParams.session_id ?? "");
  if (!sessionId) redirect("/");
  redirect(
    `/offers/us/first-grade-japanese?session_id=${encodeURIComponent(sessionId)}`
  );
}
