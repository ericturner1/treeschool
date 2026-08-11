import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { getCurrentUser } from "../../lib/auth/server";
import {
  formatCurriculumPrice,
  getFirstGradeMarketingCoverPath,
  selectFirstGradeBundle
} from "../../lib/first-grade-curriculum/catalog";
import {
  normalizeFirstGradeCurriculumVariant,
  normalizeFunnelVisitorId,
  type FirstGradeCurriculumVariant
} from "../../lib/first-grade-curriculum/experiment";
import {
  listNativeWorkbookCatalog,
  type NativeWorkbookCatalogItem
} from "../../lib/native-workbooks/server";
import { getPublicCodeFunnelExperiment } from "../../lib/funnels/server";
import { CurriculumCheckoutChoice } from "../first-grade-homeschool-curriculum/curriculum-checkout-choice";
import {
  CurriculumBundleCover,
  WorkbookCover
} from "../first-grade-homeschool-curriculum/workbook-cover";
import { FunnelExperimentTracker } from "./funnel-experiment-tracker";
import { FirstGradeCurriculumVariantB } from "./variant-b";

const PAGE_PATH = "/first-grade-curriculum";
const DETAILS_PATH = "/first-grade-homeschool-curriculum";
const FALLBACK_WORKBOOKS = [
  ["phonics-b", "Phonics B", "/first-grade-curriculum/phonics-b.png"],
  ["reading-d", "Reading (Level D)", "/first-grade-curriculum/reading-level-d.png"],
  ["reading-e", "Reading (Level E)", "/first-grade-curriculum/reading-level-e.png"],
  ["reading-f", "Reading (Level F)", "/first-grade-curriculum/reading-level-f.png"],
  ["reading-g", "Reading (Level G)", "/first-grade-curriculum/reading-level-g.png"],
  ["reading-h", "Reading (Level H)", "/first-grade-curriculum/reading-level-h.png"],
  ["reading-i", "Reading (Level I)", "/first-grade-curriculum/reading-level-i.png"],
  ["writing", "Writing & Grammar 1", "/first-grade-curriculum/writing-and-grammar-1.png"],
  ["spelling", "Spelling 1", "/first-grade-curriculum/spelling-1.png"],
  ["math", "Math 1", "/first-grade-curriculum/math-1.png"],
  ["science", "Science 1", "/first-grade-curriculum/science-1.png"],
  ["social-studies", "Social Studies 1", "/first-grade-curriculum/social-studies-1.png"]
].map(([id, title, coverPath]) => ({
  id,
  title,
  coverPath,
  slug: null as string | null,
  pageCount: null as number | null,
  previewImages: [] as Array<{ url: string; label: string }>
}));

export const metadata: Metadata = {
  title: "Complete First Grade Homeschool Curriculum | Treeschool",
  description:
    "Give your first grader a complete paper-first core curriculum for reading, language arts, math, science, and social studies—all delivered as printable PDF workbooks.",
  alternates: {
    canonical: DETAILS_PATH
  },
  robots: {
    index: false,
    follow: true
  },
  openGraph: {
    title: "Your First-Grade Homeschool Year, Ready to Print",
    description:
      "A complete paper-first core curriculum delivered as printable PDF workbooks.",
    type: "website",
    url: PAGE_PATH,
    siteName: "Treeschool",
    images: [
      {
        url: "https://www.treehomeschool.com/funnel-social-preview.png",
        width: 1731,
        height: 909,
        alt: "Treeschool printable first-grade homeschool curriculum"
      }
    ]
  }
};

function CheckIcon() {
  return (
    <span
      aria-hidden="true"
      className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#dce9cf] text-xs font-black text-[#486338]"
    >
      ✓
    </span>
  );
}

const ACADEMIC_COVERAGE_AREAS = [
  { key: "mathematics", label: "Mathematics" },
  { key: "languageArts", label: "Language arts" },
  { key: "science", label: "Science" },
  { key: "socialStudies", label: "Social studies" }
] as const;

type GradeOneCoverage = NativeWorkbookCatalogItem["curriculumCoverage"][number];

function AcademicCompletenessGraph({ coverage }: { coverage: GradeOneCoverage }) {
  return (
    <section
      aria-labelledby="academic-completeness-title"
      className="mt-10 overflow-hidden rounded-[28px] border border-[#b8cba7] bg-[#fffdf8] shadow-[0_12px_28px_rgba(72,99,56,0.08)]"
    >
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[.78fr_1.22fr] lg:items-center">
        <div>
          <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-[#486338]">
            Academic completeness
          </p>
          <h3
            id="academic-completeness-title"
            className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl"
          >
            The first-grade essentials are covered.
          </h3>
          <p className="mt-4 text-base leading-7 text-ink/64">
            Indexed lessons were compared with widely used first-grade expectations across the four core academic areas.
          </p>
        </div>

        <div className="grid gap-4" aria-label="Estimated first-grade academic coverage">
          {ACADEMIC_COVERAGE_AREAS.map((area) => {
            const score = coverage.scores[area.key];
            return (
              <div key={area.key}>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-semibold text-ink/72 sm:text-base">{area.label}</p>
                  <p className="text-lg font-semibold tabular-nums text-[#567b40]">{score}%</p>
                </div>
                <div
                  className="mt-2 h-3 overflow-hidden rounded-full bg-[#e4eadc]"
                  role="progressbar"
                  aria-label={`${area.label} estimated coverage`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={score}
                >
                  <div
                    className="h-full rounded-full bg-[#75a254]"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="border-t border-[#d9e3d0] bg-[#f4f8ef] px-6 py-3 text-center text-xs leading-5 text-ink/48 sm:px-8">
        Scores reflect direct teaching evidence found in the indexed workbook lessons.
      </p>
    </section>
  );
}

type PageSearchParams = {
  checkout?: string;
  error?: string;
  preview_variant?: string;
};

type ExperimentContext = {
  landingVariant: FirstGradeCurriculumVariant;
  funnelVisitorId: string | null;
  previewMode: boolean;
};

export default async function FirstGradeCurriculumExperimentPage(
  props: {
    searchParams?: Promise<PageSearchParams>;
  }
) {
  const searchParams = await props.searchParams;
  const requestHeaders = await headers();
  const previewVariant = normalizeFirstGradeCurriculumVariant(
    searchParams?.preview_variant
  );
  const funnelVisitorId = normalizeFunnelVisitorId(
    requestHeaders.get("x-treeschool-funnel-visitor-id")
  );
  const configuredVariant = !previewVariant && funnelVisitorId
    ? await getPublicCodeFunnelExperiment(
        "first-grade-curriculum",
        "live-ab-landing-page",
        funnelVisitorId
      )
        .then(({ experiment: configuredExperiment }) =>
          normalizeFirstGradeCurriculumVariant(configuredExperiment.variantKey)
        )
        .catch(() => null)
    : null;
  const experiment = {
    landingVariant:
      previewVariant
      ?? configuredVariant
      ?? normalizeFirstGradeCurriculumVariant(
        requestHeaders.get("x-treeschool-first-grade-curriculum-variant")
      )
      ?? "a",
    funnelVisitorId,
    previewMode: Boolean(previewVariant)
  } satisfies ExperimentContext;

  if (experiment.landingVariant === "b") {
    return (
      <FirstGradeCurriculumVariantB
        searchParams={searchParams}
        experiment={experiment}
      />
    );
  }

  return (
    <FirstGradeCurriculumVariantA
      searchParams={searchParams}
      experiment={experiment}
    />
  );
}

async function FirstGradeCurriculumVariantA({
  searchParams,
  experiment
}: {
  searchParams?: PageSearchParams;
  experiment: ExperimentContext;
}) {
  const user = await getCurrentUser();
  const { workbooks } = await listNativeWorkbookCatalog({
    userId: user?.id,
    grade: 1,
    subject: null,
    includePreviews: true
  }).catch(() => ({ workbooks: [] as NativeWorkbookCatalogItem[] }));
  const bundle = selectFirstGradeBundle(workbooks);

  const workbooksById = new Map(
    workbooks
      .filter((item) => item.catalogKind === "workbook")
      .map((item) => [item.id, item])
  );
  const members = bundle
    ? bundle.memberWorkbookIds
      .map((id) => workbooksById.get(id))
      .filter((item): item is NativeWorkbookCatalogItem => Boolean(item))
    : [];
  const displayMembers = bundle
    ? members.map((workbook) => ({
      id: workbook.id,
      slug: workbook.slug,
      title: workbook.title,
      pageCount: workbook.pageCount,
      coverPath: getFirstGradeMarketingCoverPath(workbook),
      previewImages: workbook.previewImages ?? []
    }))
    : FALLBACK_WORKBOOKS;
  const bundlePrice = bundle
    ? formatCurriculumPrice(bundle.priceInCents, bundle.currencyCode)
    : null;
  const totalPages = bundle
    ? bundle.pageCount
      ?? members.reduce(
        (total, workbook) => total + Number(workbook.pageCount ?? 0),
        0
      )
    : null;
  const memberCount = bundle?.memberCount ?? displayMembers.length;
  const gradeOneCoverage = bundle?.curriculumCoverage.find(
    (coverage) => coverage.gradeLevel === 1
  );
  const checkoutMessage =
    searchParams?.checkout === "canceled"
      ? "Checkout was canceled. Nothing was charged."
      : searchParams?.error
        ? searchParams.error
        : null;
  const faqs = [
    {
      question: "Is this a complete first-grade curriculum?",
      answer:
        "It is a complete first-grade core curriculum covering reading and language arts, mathematics, science, and social studies. Your family can still add religious instruction, electives, field trips, or other priorities."
    },
    {
      question: "Will anything be shipped to me?",
      answer:
        "No physical books are shipped. You receive downloadable PDF workbooks, so you can begin immediately and print the lessons you need."
    },
    {
      question: "Do I have to subscribe to Treeschool?",
      answer:
        bundlePrice
          ? `No. You can buy the complete curriculum once for ${bundlePrice}. Before checkout, you will also have the option to use the curriculum with Treeschool’s planning and recordkeeping membership.`
          : "No. The complete curriculum is available as a one-time purchase. Before checkout, you will also have the option to use the curriculum with Treeschool’s planning and recordkeeping membership."
    },
    {
      question: "Does my child need to learn on a computer?",
      answer:
        "No. The curriculum is designed for paper-first learning. A parent may use Treeschool online for planning and records, but the child can work from printed lessons, books, projects, and real-life activities."
    },
    {
      question: "Can we teach at our own pace?",
      answer:
        "Yes. The files are yours to print and teach at the pace that fits your child and family."
    }
  ];

  return (
    <main className="min-h-screen bg-[#f8f2e8] text-ink">
      <FunnelExperimentTracker
        variant={experiment.landingVariant}
        preview={experiment.previewMode}
        visitorId={experiment.funnelVisitorId}
      />
      {checkoutMessage ? (
        <div className="border-b border-[#e3cfaf] bg-[#fff6e7] px-4 py-3 text-center text-sm font-semibold text-[#77512f]">
          {checkoutMessage}
        </div>
      ) : null}

      <section className="relative overflow-hidden border-b border-[#b7cba4] bg-[#e8f1df]">
        <div className="absolute -left-32 -top-40 h-96 w-96 rounded-full border-[58px] border-white/24" />
        <div className="absolute -bottom-44 -right-28 h-96 w-96 rounded-full border-[58px] border-white/20" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-9 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(350px,.72fr)] lg:py-14">
          <div className="max-w-[680px]">
            <p className="label-font inline-flex rounded-full border border-[#9db887] bg-white/60 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#486338] sm:text-sm">
              Complete printable first-grade curriculum
            </p>
            <h1 className="mt-5 text-[42px] font-semibold leading-[1.02] tracking-[-0.06em] sm:text-6xl lg:text-[66px]">
              Homeschool first grade without piecing it all together yourself.
            </h1>
            <p className="mt-5 max-w-[650px] text-lg leading-8 text-ink/74 sm:text-xl">
              Get a coordinated, paper-first core curriculum for reading, language arts, math, science, and social studies—ready to download, print, and teach.
            </p>

            <div className="mt-7 max-w-[480px]">
              {bundle?.accessState === "owned" ? (
                <div className="rounded-[16px] border border-[#9db887] bg-white/65 px-5 py-4 text-center text-sm font-semibold text-[#486338]">
                  This curriculum is already in your library.
                </div>
              ) : bundle && bundlePrice ? (
                <CurriculumCheckoutChoice
                  bundleSlug={bundle.slug}
                  bundlePrice={bundlePrice}
                  bundlePriceInCents={bundle.priceInCents}
                  currencyCode={bundle.currencyCode}
                  userEmail={user?.email ?? null}
                  triggerLabel={`Get the complete curriculum · ${bundlePrice}`}
                  triggerStyle="green"
                  returnPath={PAGE_PATH}
                  landingVariant={experiment.landingVariant}
                  funnelVisitorId={experiment.funnelVisitorId}
                  previewMode={experiment.previewMode}
                />
              ) : (
                <div className="rounded-[16px] border border-[#9db887] bg-white/65 px-5 py-4 text-center text-sm font-semibold text-[#486338]">
                  Curriculum preview — checkout becomes available when the catalog is connected.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink/58">
              <span>One-time PDF purchase</span>
              <span aria-hidden="true">·</span>
              <span>No subscription required</span>
              <span aria-hidden="true">·</span>
              <span>Secure Stripe checkout</span>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[400px]">
            <div className="relative">
              <div className="absolute -bottom-3 -right-3 h-full w-full rounded-[28px] bg-[#b9cda5]" />
              <div className="relative rounded-[28px] border border-[#98b27f] bg-[#fffaf2] p-4 shadow-[0_20px_48px_rgba(72,99,56,.16)]">
                <CurriculumBundleCover
                  title={bundle?.title ?? "Complete First-Grade Curriculum"}
                  src={bundle?.thumbnailUrl ?? null}
                  priority
                />
              </div>
            </div>
            <p className="mt-5 text-center text-sm font-semibold leading-6 text-ink/62">
              {memberCount} PDF workbooks
              {totalPages ? ` · ${totalPages.toLocaleString()} printable pages` : ""}
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#dfcfb8] bg-[#fffaf2]">
        <div className="mx-auto grid w-full max-w-6xl divide-y divide-[#dfcfb8] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ["Core subjects covered", "One coordinated first-grade collection"],
            ["Teach on paper", "Keep your child from being glued to another screen"],
            ["Start right away", "Download the PDF workbooks after purchase"]
          ].map(([title, description]) => (
            <div key={title} className="px-5 py-5 text-center">
              <p className="text-lg font-semibold tracking-[-0.025em] text-[#486338]">
                {title}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink/56">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#f8f2e8]">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:py-[72px]">
          <div>
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
              A clearer way to begin
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
              You should not need forty browser tabs to build first grade.
            </h2>
            <p className="mt-5 text-lg leading-8 text-ink/68">
              Searching for worksheets one subject at a time leaves parents wondering what is missing, what comes next, and whether the pieces will last the year. Treeschool brings the core subjects together in one printable collection.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Reading & language arts", "Phonics, reading practice, spelling, writing, and grammar."],
              ["Mathematics", "A steady first-grade progression through foundational math."],
              ["Science", "Age-appropriate lessons that help children observe and understand the world."],
              ["Social studies", "Foundations in community, geography, civics, history, and everyday life."]
            ].map(([title, description]) => (
              <article
                key={title}
                className="rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-5 shadow-[0_8px_20px_rgba(80,58,39,.06)]"
              >
                <div className="flex items-center gap-3">
                  <CheckIcon />
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-7 text-ink/62">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="inside" className="scroll-mt-4 border-y border-[#c3d3b4] bg-[#eef5e7]">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-[#486338]">
              What you receive
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
              These are the actual books inside.
            </h2>
            <p className="mt-4 text-lg leading-8 text-ink/64">
              Not a promise of future content. Not access that disappears when you cancel. You receive the complete printable PDF collection shown here.
            </p>
          </div>

          <div className="mt-9 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
            {displayMembers.slice(0, 14).map((workbook, index) => (
              <article key={workbook.id} className="min-w-0">
                <WorkbookCover
                  title={workbook.title}
                  src={workbook.coverPath}
                  previewImages={workbook.previewImages}
                  previewSlug={workbook.slug ?? undefined}
                  priority={index < 4}
                />
                {workbook.pageCount ? (
                  <p className="mt-2 text-center text-xs font-semibold text-ink/48">
                    {workbook.pageCount.toLocaleString()} pages
                  </p>
                ) : null}
              </article>
            ))}
          </div>

          {gradeOneCoverage ? (
            <AcademicCompletenessGraph coverage={gradeOneCoverage} />
          ) : null}
        </div>
      </section>

      <section className="bg-[#fffaf2]">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
              Simple delivery
            </p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              Buy. Download. Teach.
            </h2>
          </div>
          <div className="mt-9 grid gap-5 md:grid-cols-3">
            {[
              ["1", "Choose the curriculum", "Purchase the printable collection once, or choose Treeschool planning when the option appears."],
              ["2", "Open your secure download", "We deliver access to the PDF workbooks after checkout."],
              ["3", "Print and teach your way", "Print complete books or only the lessons your child needs, on the schedule that fits your family."]
            ].map(([number, title, description]) => (
              <article
                key={number}
                className="rounded-[24px] border border-[#dcc8aa] bg-[#f8f2e8] p-6"
              >
                <span className="label-font grid h-10 w-10 place-items-center rounded-full bg-[#77583f] text-lg font-black text-white">
                  {number}
                </span>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.035em]">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink/62">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#d6c2a5] bg-[#f1e3d1]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
              One purchase. A full core year.
            </p>
            <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">
              Stop searching for the next worksheet and start teaching.
            </h2>
            <p className="mt-3 text-base leading-7 text-ink/64">
              {memberCount} printable PDF workbooks
              {totalPages ? ` · ${totalPages.toLocaleString()} pages` : ""}
              {bundlePrice ? ` · ${bundlePrice} one time` : " · one-time purchase"}
            </p>
          </div>
          <div className="w-full lg:w-[390px]">
            {bundle?.accessState === "owned" ? (
              <div className="rounded-[16px] border border-[#b69a78] bg-white/65 px-5 py-4 text-center text-sm font-semibold text-[#6f513e]">
                This curriculum is already in your library.
              </div>
            ) : bundle && bundlePrice ? (
              <CurriculumCheckoutChoice
                bundleSlug={bundle.slug}
                bundlePrice={bundlePrice}
                bundlePriceInCents={bundle.priceInCents}
                currencyCode={bundle.currencyCode}
                userEmail={user?.email ?? null}
                triggerLabel={`Get the curriculum · ${bundlePrice}`}
                returnPath={PAGE_PATH}
                landingVariant={experiment.landingVariant}
                funnelVisitorId={experiment.funnelVisitorId}
                previewMode={experiment.previewMode}
              />
            ) : (
              <div className="rounded-[16px] border border-[#b69a78] bg-white/65 px-5 py-4 text-center text-sm font-semibold text-[#6f513e]">
                Curriculum preview — checkout is temporarily unavailable.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="bg-[#f8f2e8]">
        <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:py-16">
          <p className="label-font text-center text-sm font-black uppercase tracking-[0.1em] text-earth">
            Questions parents ask
          </p>
          <h2 className="mt-3 text-center text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Before you choose.
          </h2>
          <div className="mt-8 grid gap-4">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-5"
              >
                <summary className="cursor-pointer list-none pr-8 text-lg font-semibold marker:content-none">
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className="float-right text-[#567b40] transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-7 text-ink/66">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#e3eed9] px-4 py-14 text-center sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Image
            src="/tree-icon.png"
            alt=""
            width={74}
            height={74}
            className="mx-auto h-16 w-16 object-contain"
          />
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
            Your first-grade year can feel ready.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-ink/66">
            Begin with the core subjects already gathered into one printable, paper-first curriculum.
          </p>
          <div className="mx-auto mt-7 max-w-[440px]">
            {bundle?.accessState === "owned" ? (
              <div className="rounded-[16px] border border-[#9db887] bg-white/65 px-5 py-4 text-center text-sm font-semibold text-[#486338]">
                This curriculum is already in your library.
              </div>
            ) : bundle && bundlePrice ? (
              <CurriculumCheckoutChoice
                bundleSlug={bundle.slug}
                bundlePrice={bundlePrice}
                bundlePriceInCents={bundle.priceInCents}
                currencyCode={bundle.currencyCode}
                userEmail={user?.email ?? null}
                triggerLabel={`Get the complete curriculum · ${bundlePrice}`}
                triggerStyle="green"
                returnPath={PAGE_PATH}
                landingVariant={experiment.landingVariant}
                funnelVisitorId={experiment.funnelVisitorId}
                previewMode={experiment.previewMode}
              />
            ) : (
              <div className="rounded-[16px] border border-[#9db887] bg-white/65 px-5 py-4 text-center text-sm font-semibold text-[#486338]">
                Curriculum preview — checkout is temporarily unavailable.
              </div>
            )}
          </div>
        </div>
      </section>

    </main>
  );
}
