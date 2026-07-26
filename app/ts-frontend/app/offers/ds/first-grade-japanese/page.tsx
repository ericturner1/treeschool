import type { Metadata } from "next";
import { FirstGradeJapaneseOfferPageContent } from "../../first-grade-japanese/offer-page";

export const metadata: Metadata = {
  title: "Optional Japanese Starter Workbook | Treeschool",
  referrer: "no-referrer",
  robots: { index: false, follow: false }
};

export default async function FirstGradeJapaneseDownsellPage({
  searchParams
}: {
  searchParams: { session_id?: string };
}) {
  return FirstGradeJapaneseOfferPageContent({ searchParams, stage: "ds" });
}
