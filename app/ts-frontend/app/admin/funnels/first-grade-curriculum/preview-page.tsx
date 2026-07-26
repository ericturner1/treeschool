import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import type {
  FirstGradePostCheckoutOffer,
  PostCheckoutWorkbookOfferItem
} from "../../../../lib/billing/server";
import {
  getNativeWorkbookNavigation,
  listNativeWorkbookCatalog
} from "../../../../lib/native-workbooks/server";
import { FirstGradeJapaneseOfferExperience } from "../../../offers/first-grade-japanese/offer-experience";

type OfferStage = "upsell" | "downsell";

function isJapaneseTitle(value: string) {
  return /\bjapanese(?:\s+|\s*\(\s*level\s*)[a-d]\b/i.test(value);
}

function isBeginnerJapaneseBundle(value: string) {
  return value.trim().toLowerCase() === "beginner japanese";
}

export async function FirstGradeCurriculumFunnelPreview({
  stage
}: {
  stage: OfferStage;
}) {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect(`/p/signin?next=/admin/funnels/first-grade-curriculum/${stage}`);
  }
  const access = await getNativeWorkbookNavigation(user.id).catch(() => null);
  if (!access?.isAdmin) notFound();

  const { workbooks } = await listNativeWorkbookCatalog({
    userId: user.id,
    // Load the bundle as an authored product. Individual bundle members may
    // span a wider grade range than the funnel's entry grade.
    grade: null,
    subject: null
  });
  const japaneseBundle = workbooks.find(
    (item) =>
      item.catalogKind === "bundle" &&
      isBeginnerJapaneseBundle(item.title)
  ) ?? null;
  const workbookById = new Map(
    workbooks
      .filter((item) => item.catalogKind === "workbook")
      .map((item) => [item.id, item])
  );
  const bundleMemberIds = japaneseBundle?.members?.map((item) => item.id) ??
    japaneseBundle?.memberWorkbookIds ??
    [];
  const orderedJapaneseWorkbooks = bundleMemberIds.length
    ? bundleMemberIds
        .map((id) => workbookById.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : workbooks
        .filter((item) =>
          item.catalogKind === "workbook" &&
          item.activeVersionId &&
          isJapaneseTitle(item.title)
        )
        .sort((a, b) => a.title.localeCompare(b.title));
  const liveJapanese: PostCheckoutWorkbookOfferItem[] = workbooks
    .filter((item) => orderedJapaneseWorkbooks.some((workbook) => workbook.id === item.id))
    .sort(
      (a, b) =>
        orderedJapaneseWorkbooks.findIndex((workbook) => workbook.id === a.id) -
        orderedJapaneseWorkbooks.findIndex((workbook) => workbook.id === b.id)
    )
    .slice(0, 4)
    .map((item) => ({
      id: item.id,
      versionId: item.activeVersionId!,
      title: item.title,
      description: item.description,
      priceInCents: item.priceInCents,
      currencyCode: item.currencyCode,
      thumbnailUrl: item.thumbnailUrl
    }));
  const seed = liveJapanese[0] ?? {
    id: "preview-japanese-a",
    versionId: "preview",
    title: "Japanese A",
    description: "Preview workbook",
    priceInCents: 999,
    currencyCode: "USD",
    thumbnailUrl: null
  };
  const previewItems = Array.from({ length: 4 }, (_, index) =>
    liveJapanese[index] ?? {
      ...seed,
      id: `preview-japanese-${String.fromCharCode(97 + index)}`,
      title: `Japanese ${String.fromCharCode(65 + index)}`,
      thumbnailUrl: null
    }
  );
  const data: FirstGradePostCheckoutOffer = {
    sourceCheckoutSessionId: "admin-preview",
    state: stage === "downsell" ? "downsell_shown" : "shown",
    selectedVariant: stage === "downsell" ? "starter" : null,
    thankYouPath: `/admin/funnels/first-grade-curriculum/${stage}`,
    offer: {
      full: {
        key: japaneseBundle?.slug ?? "japanese-a-d",
        title: japaneseBundle?.title ?? "Japanese A–D",
        description: japaneseBundle?.description ??
          "Add a printable Japanese language sequence that can grow with your child beyond the core first-grade subjects.",
        items: previewItems,
        priceInCents: japaneseBundle?.priceInCents ??
          previewItems.reduce((total, item) => total + item.priceInCents, 0),
        currencyCode: japaneseBundle?.currencyCode ?? seed.currencyCode,
        thumbnailUrl: japaneseBundle?.thumbnailUrl ?? null
      },
      starter: {
        key: "japanese-a",
        title: previewItems[0].title,
        description:
          "Begin with the first Japanese workbook now. You can add later levels whenever your family is ready.",
        items: [previewItems[0]],
        priceInCents: previewItems[0].priceInCents,
        currencyCode: previewItems[0].currencyCode
      }
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f1e7] px-4 py-4 text-ink sm:px-6 sm:py-8">
      <FirstGradeJapaneseOfferExperience
        data={data}
        previewMode
        showPreviewNotice={false}
        initialMode={stage === "downsell" ? "starter" : "full"}
        previewDownsellPath="/admin/funnels/first-grade-curriculum/downsell"
      />
      <div className="mx-auto mt-14 max-w-5xl text-center">
        <Link href="/admin" className="text-xs font-semibold text-ink/40 underline underline-offset-4 hover:text-ink/65">
          Back to Admin
        </Link>
      </div>
    </main>
  );
}
