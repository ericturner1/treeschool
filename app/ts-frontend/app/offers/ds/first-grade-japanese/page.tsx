import type { Metadata } from "next";
import { FirstGradeJapaneseOfferPageContent } from "../../first-grade-japanese/offer-page";

export const metadata: Metadata = {
  title: "Optional Japanese Starter Workbook | Treeschool",
  referrer: "no-referrer",
  robots: { index: false, follow: false }
};

export default async function FirstGradeJapaneseDownsellPage(
  props: {
    searchParams: Promise<{ session_id?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  return FirstGradeJapaneseOfferPageContent({ searchParams, stage: "ds" });
}
