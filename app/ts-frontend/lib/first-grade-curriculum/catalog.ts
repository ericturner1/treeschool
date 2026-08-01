import type { NativeWorkbookCatalogItem } from "../native-workbooks/server";

const SITE_URL = "https://www.treehomeschool.com";

export function formatCurriculumPrice(
  priceInCents: number,
  currencyCode: string
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(priceInCents / 100);
}

export function selectFirstGradeBundle(
  catalog: NativeWorkbookCatalogItem[]
) {
  const bundles = catalog.filter((item) => item.catalogKind === "bundle");

  return (
    bundles.find(
      (item) =>
        item.isRecommendedCurriculum && item.recommendedGradeLevel === 1
    )
    ?? bundles.find(
      (item) =>
        item.gradeMin <= 1
        && item.gradeMax >= 1
        && /(?:grade|first).*(?:1|one).*core|core.*(?:grade|first).*(?:1|one)/i.test(
          item.title
        )
    )
    ?? null
  );
}

export function getFirstGradeMarketingCoverPath(
  workbook: NativeWorkbookCatalogItem
) {
  const title = workbook.title.toLowerCase();
  const readingLevel = title.match(
    /(?:reader|reading).*level[\s(-]*([d-i])/i
  )?.[1]?.toLowerCase();

  if (readingLevel) {
    return `/first-grade-curriculum/reading-level-${readingLevel}.png`;
  }
  if (title.includes("phonics") && /\bb\b/.test(title)) {
    return "/first-grade-curriculum/phonics-b.png";
  }
  if (title.includes("writing") && title.includes("grammar")) {
    return "/first-grade-curriculum/writing-and-grammar-1.png";
  }
  if (title.includes("spell")) {
    return "/first-grade-curriculum/spelling-1.png";
  }
  if (title.includes("social studies")) {
    return "/first-grade-curriculum/social-studies-1.png";
  }
  if (title.includes("science")) {
    return "/first-grade-curriculum/science-1.png";
  }
  if (title.includes("math")) {
    return "/first-grade-curriculum/math-1.png";
  }

  return workbook.thumbnailUrl;
}

export function getFirstGradeMarketingCoverUrl(
  workbook: NativeWorkbookCatalogItem
) {
  const path = getFirstGradeMarketingCoverPath(workbook);
  return path?.startsWith("/") ? `${SITE_URL}${path}` : path;
}
