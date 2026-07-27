import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/server";
import {
  listNativeWorkbookCatalog,
  type NativeWorkbookCatalogItem
} from "../../lib/native-workbooks/server";
import { CurriculumBundleCover, WorkbookCover } from "./workbook-cover";
import { CurriculumCheckoutChoice } from "./curriculum-checkout-choice";

const SITE_URL = "https://www.treehomeschool.com";
const PAGE_PATH = "/first-grade-homeschool-curriculum";

export const metadata: Metadata = {
  title: "First Grade Homeschool Curriculum | Printable Complete Program",
  description:
    "Explore a complete first-grade homeschool curriculum made from printable workbooks for reading, language arts, math, science, and social studies. Buy it once or use it with Treeschool’s lesson planning and recordkeeping tools.",
  alternates: {
    canonical: PAGE_PATH
  },
  keywords: [
    "first grade homeschool curriculum",
    "1st grade homeschool curriculum",
    "printable first grade curriculum",
    "paper based homeschool curriculum",
    "complete first grade homeschool program",
    "screen free homeschool curriculum"
  ],
  openGraph: {
    title: "A Complete Printable First-Grade Homeschool Curriculum",
    description:
      "See every workbook in Treeschool’s paper-first curriculum, then buy the collection outright or use it with weekly plans and homeschool records.",
    type: "website",
    url: PAGE_PATH,
    siteName: "Treeschool",
    images: [
      {
        url: `${SITE_URL}/funnel-social-preview.png`,
        width: 1731,
        height: 909,
        alt: "Treeschool printable first-grade homeschool curriculum"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "A Complete Printable First-Grade Homeschool Curriculum",
    description:
      "A paper-first collection for the whole first-grade year—available outright or with Treeschool planning tools.",
    images: [`${SITE_URL}/funnel-social-preview.png`]
  }
};

function formatPrice(priceInCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(priceInCents / 100);
}

function selectFirstGradeBundle(catalog: NativeWorkbookCatalogItem[]) {
  const bundles = catalog.filter((item) => item.catalogKind === "bundle");
  return (
    bundles.find(
      (item) => item.isRecommendedCurriculum && item.recommendedGradeLevel === 1
    )
    ?? bundles.find(
      (item) =>
        item.gradeMin <= 1
        && item.gradeMax >= 1
        && /(?:grade|first).*(?:1|one).*core|core.*(?:grade|first).*(?:1|one)/i.test(item.title)
    )
    ?? null
  );
}

function CheckIcon() {
  return (
    <span
      aria-hidden="true"
      className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[#dceacd] text-sm font-black text-[#486338]"
    >
      ✓
    </span>
  );
}

function getMarketingCoverPath(workbook: NativeWorkbookCatalogItem) {
  const title = workbook.title.toLowerCase();
  const readingLevel = title.match(/(?:reader|reading).*level[\s(-]*([d-i])/i)?.[1]?.toLowerCase();

  if (readingLevel) return `/first-grade-curriculum/reading-level-${readingLevel}.png`;
  if (title.includes("phonics") && /\bb\b/.test(title)) return "/first-grade-curriculum/phonics-b.png";
  if (title.includes("writing") && title.includes("grammar")) return "/first-grade-curriculum/writing-and-grammar-1.png";
  if (title.includes("spell")) return "/first-grade-curriculum/spelling-1.png";
  if (title.includes("social studies")) return "/first-grade-curriculum/social-studies-1.png";
  if (title.includes("science")) return "/first-grade-curriculum/science-1.png";
  if (title.includes("math")) return "/first-grade-curriculum/math-1.png";

  return workbook.thumbnailUrl;
}

function getMarketingCoverUrl(workbook: NativeWorkbookCatalogItem) {
  const path = getMarketingCoverPath(workbook);
  return path?.startsWith("/") ? `${SITE_URL}${path}` : path;
}

const GRADE_ONE_EXPECTATION_AREAS = [
  {
    key: "mathematics",
    label: "Mathematics",
    framework: "Common Core · Grade 1",
    sourceHref: "https://www.thecorestandards.org/Math/Content/1/introduction/"
  },
  {
    key: "languageArts",
    label: "Language arts",
    framework: "Common Core · Grade 1",
    sourceHref: "https://www.thecorestandards.org/ELA-Literacy/"
  },
  {
    key: "science",
    label: "Science",
    framework: "NGSS · Grade 1",
    sourceHref: "https://www.nextgenscience.org/overview-topics"
  },
  {
    key: "socialStudies",
    label: "Social studies",
    framework: "NCSS C3 · K–2",
    sourceHref:
      "https://members.socialstudies.org/store/social-studies-for-the-next-generation-purposes-practices-and-implications-of-the-college-career-and-civic-life-c3-framework-for-socialstudies-state-standards-national-council-for-the-social-studies/1139/"
  }
] as const;

type GradeOneCoverage =
  NativeWorkbookCatalogItem["curriculumCoverage"][number];

function CurriculumStandardsMetrics({ coverage }: { coverage: GradeOneCoverage }) {
  return (
    <section
      aria-labelledby="standards-coverage-title"
      className="border-y border-[#cbd9bd] bg-[#e8f0e1]"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#486338]">
            First-grade coverage
          </p>
          <h2
            id="standards-coverage-title"
            className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl"
          >
            See how the curriculum covers the essentials.
          </h2>
          <p className="mt-5 text-lg leading-8 text-ink/68">
            Coverage is measured against widely used English-language elementary standards.
          </p>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GRADE_ONE_EXPECTATION_AREAS.map((area) => {
            const score = coverage.scores[area.key];
            return (
              <article
                key={area.key}
                className="rounded-[20px] border border-[#b8cba7] bg-[#fffdf8] p-4 shadow-[0_8px_18px_rgba(72,99,56,0.07)]"
              >
                <div className="flex items-end justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-[-0.025em]">{area.label}</h3>
                  <p className="text-2xl font-semibold tabular-nums tracking-[-0.04em] text-[#567b40]">
                    {score}%
                  </p>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4eadc]"
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
                <a
                  href={area.sourceHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-xs font-semibold leading-5 text-ink/48 transition-colors hover:text-[#486338]"
                >
                  {area.framework}
                  <span aria-hidden="true">&nbsp;↗</span>
                </a>
              </article>
            );
          })}
        </div>

        <p className="mx-auto mt-4 max-w-4xl text-center text-xs leading-5 text-ink/48">
          Scores reflect direct teaching evidence found in the indexed workbook lessons.
        </p>
      </div>
    </section>
  );
}

export default async function FirstGradeHomeschoolCurriculumPage() {
  const user = await getCurrentUser();
  const { workbooks } = await listNativeWorkbookCatalog({
    userId: user?.id,
    grade: 1,
    subject: null
  }).catch(() => ({ workbooks: [] as NativeWorkbookCatalogItem[] }));
  const bundle = selectFirstGradeBundle(workbooks);
  if (!bundle) notFound();

  const workbooksById = new Map(
    workbooks
      .filter((item) => item.catalogKind === "workbook")
      .map((item) => [item.id, item])
  );
  const members = bundle.memberWorkbookIds
    .map((id) => workbooksById.get(id))
    .filter((item): item is NativeWorkbookCatalogItem => Boolean(item));
  const bundlePrice = formatPrice(bundle.priceInCents, bundle.currencyCode);
  const gradeOneCoverage = bundle.curriculumCoverage.find(
    (coverage) => coverage.gradeLevel === 1
  );
  const subjects = Array.from(new Set(members.map((member) => member.subjectLabel)));
  const totalPages =
    bundle.pageCount
    ?? members.reduce((total, member) => total + Number(member.pageCount ?? 0), 0);
  const bundleUrl = `${SITE_URL}/bookstore/${bundle.slug}`;
  const pageUrl = `${SITE_URL}${PAGE_PATH}`;

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": ["CollectionPage", "LearningResource"],
    name: "Treeschool First Grade Homeschool Curriculum",
    description:
      "A complete paper-first first-grade curriculum made from printable core-subject workbooks.",
    url: pageUrl,
    educationalLevel: "Grade 1",
    learningResourceType: "Printable homeschool curriculum",
    inLanguage: "en",
    isFamilyFriendly: true,
    audience: {
      "@type": "EducationalAudience",
      educationalRole: "parent",
      audienceType: "Homeschool families"
    },
    hasPart: members.map((member) => ({
      "@type": ["Book", "LearningResource"],
      name: member.title,
      url: `${SITE_URL}/bookstore/${member.slug}`,
      image: getMarketingCoverUrl(member) ?? undefined,
      numberOfPages: member.pageCount ?? undefined,
      about: member.subjectLabel
    }))
  };
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: bundle.title,
    description: bundle.description,
    url: bundleUrl,
    image: [
      bundle.thumbnailUrl,
      ...members.map(getMarketingCoverUrl)
    ].filter(Boolean),
    sku: bundle.id,
    brand: { "@type": "Brand", name: "Treeschool" },
    category: "First grade homeschool curriculum",
    offers: {
      "@type": "Offer",
      url: bundleUrl,
      priceCurrency: bundle.currencyCode,
      price: (bundle.priceInCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition"
    }
  };
  const faqs = [
    {
      question: "Does this cover a complete first-grade school year?",
      answer:
        "The collection is designed as a complete first-grade core curriculum, with printable materials across reading and language arts, mathematics, science, and social studies. Parents remain free to add electives, projects, religious instruction, or other family priorities."
    },
    {
      question: "Are these physical books?",
      answer:
        "No. The workbooks are downloadable PDF files. You can print the complete books, print only the lessons you need, or use Treeschool to organize selected lessons into weekly and daily files."
    },
    {
      question: "Do I need a subscription to buy the curriculum?",
      answer:
        `No. You can buy the complete curriculum bundle once for ${bundlePrice} and keep the PDF workbooks. A Treeschool membership is optional.`
    },
    {
      question: "What does the Treeschool membership add?",
      answer:
        "Membership adds automatic lesson-plan generation, printable weekly and daily lesson files, attendance, optional grades, progress tracking, points, streaks, school-year pacing, and access to the core curriculum inside the planner."
    },
    {
      question: "Will my child need to use a computer?",
      answer:
        "The curriculum is designed for paper-first learning. The parent can use Treeschool online to organize and record the year while the child learns primarily through printed workbooks, books, projects, conversation, and hands-on activities."
    }
  ];
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer }
    }))
  };

  return (
    <main className="min-h-screen bg-[#f7f1e7] text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }}
      />

      <header className="border-b border-[#ddccb2] bg-[#fffaf2]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/tree-icon.png"
              alt="Treeschool tree icon"
              width={72}
              height={72}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
              priority
            />
            <span className="brand-logo hidden text-[27px] font-semibold leading-none sm:block">
              treeschool
            </span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm font-semibold text-ink/65 sm:gap-6">
            <Link href="/bookstore" className="hidden transition-colors hover:text-ink sm:inline">
              Bookstore
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-ink">
              Pricing
            </Link>
            <Link
              href={user ? "/p/dashboard" : "/p/signin"}
              className="cta-button cta-button--dark cta-button--small"
            >
              {user ? "Dashboard" : "Parent sign in"}
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#b8cba7] bg-[#e8f0e1]">
        <div className="absolute -right-28 -top-32 h-96 w-96 rounded-full border-[58px] border-white/25" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,.95fr)] lg:px-8 lg:py-16">
          <div className="max-w-[670px]">
            <p className="label-font inline-flex rounded-full border border-[#9eb889] bg-[#f7fbf1] px-4 py-2 text-sm font-black uppercase text-[#486338]">
              Complete first-grade curriculum
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-5xl lg:text-[62px]">
              The whole first-grade year, ready to print.
            </h1>
            <p className="mt-5 max-w-[640px] text-lg leading-8 text-ink/76 sm:text-[20px]">
              Start with a complete, paper-first collection covering the core subjects your first grader needs—without turning school into another day on a screen.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#choose-your-path" className="cta-button cta-button--light">
                Get the complete curriculum
                <span aria-hidden="true">↓</span>
              </a>
              <a href="#included-workbooks" className="cta-button cta-button--outline">
                See every workbook
              </a>
            </div>
            <p className="mt-4 text-sm font-semibold leading-6 text-ink/58">
              {bundle.memberCount} printable workbooks · {totalPages.toLocaleString()} pages · Buy once or use with Treeschool
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[530px] lg:mx-0">
            <div className="absolute -bottom-4 -right-4 h-full w-full rounded-[32px] bg-[#bdd0aa]" />
            <div className="relative rounded-[32px] border border-[#9eb889] bg-[#fffaf2] p-4 shadow-[0_18px_42px_rgba(72,99,56,0.16)] sm:p-6">
              <CurriculumBundleCover
                title={bundle.title}
                src={bundle.thumbnailUrl}
                priority
              />
              <div className="mt-5 text-center">
                <p className="text-xl font-semibold tracking-[-0.035em] text-ink">
                  {bundle.title}
                </p>
                <p className="label-font mt-2 text-xs font-black uppercase tracking-[0.1em] text-[#486338] sm:text-sm">
                  {bundle.memberCount} printable workbooks · Complete core curriculum
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#e2d4bf] bg-[#fffaf2]">
        <div className="mx-auto grid w-full max-w-6xl gap-px bg-[#e2d4bf] sm:grid-cols-3">
          {[
            ["Complete core", "A coordinated first-grade starting point"],
            ["Paper first", "Printable lessons instead of another child-facing app"],
            ["Teach your way", "Buy it outright or add Treeschool’s planning tools"]
          ].map(([title, copy]) => (
            <div key={title} className="bg-[#fffaf2] px-6 py-6 text-center">
              <p className="text-2xl font-semibold tracking-[-0.04em] text-[#486338]">{title}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-ink/58">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="included-workbooks" className="scroll-mt-6 bg-[#f7f1e7]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-earth">
              Inside the collection
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
              Every workbook in the first-grade bundle.
            </h2>
            <p className="mt-5 text-lg leading-8 text-ink/68">
              These are the actual printable workbooks included in the collection today.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {members.map((workbook) => (
              <article key={workbook.id} className="min-w-0">
                <WorkbookCover
                  title={workbook.title}
                  src={getMarketingCoverPath(workbook)}
                />
                {workbook.pageCount ? (
                  <p className="mt-2 text-center text-xs font-semibold text-ink/50">
                    {workbook.pageCount.toLocaleString()} pages
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#ddc9ad] bg-[#f2e5d4]">
        <div className="mx-auto grid w-full max-w-7xl gap-9 px-4 py-14 sm:px-6 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:px-8 lg:py-16">
          <div>
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#486338]">
              A strong first-grade foundation
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
              Core subjects, thoughtfully kept together.
            </h2>
            <p className="mt-5 text-lg leading-8 text-ink/68">
              Instead of piecing together unrelated downloads, begin with a coordinated collection designed to carry a child through the year at a steady, age-appropriate pace.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {subjects.map((subject) => (
              <div
                key={subject}
                className="flex items-center gap-3 rounded-[20px] border border-[#dcc5a7] bg-[#fffaf2] px-5 py-4"
              >
                <CheckIcon />
                <span className="text-lg font-semibold">{subject}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {gradeOneCoverage ? (
        <CurriculumStandardsMetrics coverage={gradeOneCoverage} />
      ) : null}

      <section id="choose-your-path" className="scroll-mt-6 bg-[#fffaf2]">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-earth">
              Choose what fits your family
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
              The curriculum by itself—or the complete Treeschool system.
            </h2>
            <p className="mt-5 text-lg leading-8 text-ink/68">
              Both paths begin with the same printable first-grade materials. The difference is how much planning and recordkeeping you want Treeschool to handle.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <article className="flex flex-col rounded-[30px] border border-[#d8c7ad] bg-[#f7f1e7] p-6 shadow-[0_12px_28px_rgba(79,54,34,0.07)] sm:p-8">
              <p className="label-font text-sm font-black uppercase tracking-[0.11em] text-earth">
                Buy once
              </p>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">
                Own the complete curriculum.
              </h3>
              <p className="mt-4 text-lg leading-8 text-ink/66">
                Download every workbook, print what you need, and organize the teaching year yourself. No recurring subscription is required.
              </p>
              <p className="mt-6 text-4xl font-semibold tracking-[-0.045em]">{bundlePrice}</p>
              <p className="mt-1 text-sm font-semibold text-ink/52">One-time purchase</p>
              <ul className="mt-6 space-y-3">
                {[
                  `${bundle.memberCount} downloadable PDF workbooks`,
                  `${totalPages.toLocaleString()} printable curriculum pages`,
                  "Secure download links delivered by email",
                  "The files remain yours to keep"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-semibold leading-6 text-ink/70">
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {bundle.accessState === "owned" ? (
                <div className="mt-auto pt-8">
                  <p className="rounded-[16px] bg-[#dfead4] px-4 py-3 text-sm font-semibold text-[#486338]">
                    You already own every workbook in this curriculum.
                  </p>
                  <Link href="/p/purchased-workbooks" className="cta-button cta-button--dark mt-4 w-full justify-center">
                    Open Purchased Workbooks
                  </Link>
                </div>
              ) : (
                <div className="mt-auto pt-8">
                  <CurriculumCheckoutChoice
                    bundleSlug={bundle.slug}
                    bundlePrice={bundlePrice}
                    userEmail={user?.email ?? null}
                    triggerLabel={`Buy the curriculum · ${bundlePrice}`}
                  />
                </div>
              )}
            </article>

            <article className="relative flex flex-col overflow-hidden rounded-[30px] border border-[#8daa75] bg-[#eef5e4] p-6 shadow-[0_16px_36px_rgba(72,99,56,0.13)] sm:p-8">
              <span className="absolute right-5 top-5 rounded-full bg-[#6f984e] px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] text-white">
                Planning included
              </span>
              <p className="label-font pr-36 text-sm font-black uppercase tracking-[0.11em] text-[#486338]">
                Treeschool membership
              </p>
              <h3 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">
                Let Treeschool organize the year.
              </h3>
              <p className="mt-4 text-lg leading-8 text-ink/66">
                Use the core curriculum inside Treeschool, turn it into printable weekly and daily lesson plans, and keep the school year’s records in one calm parent dashboard.
              </p>
              <p className="mt-6 text-4xl font-semibold tracking-[-0.045em]">$6</p>
              <p className="mt-1 text-sm font-semibold text-ink/52">
                First month, then Single is $14/month · Cancel anytime
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "First-grade core curriculum inside the planner",
                  "Printable weekly plans or separate day files",
                  "Attendance, optional grades, and progress",
                  "School-year pacing, learning streaks, and points"
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-semibold leading-6 text-ink/70">
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {bundle.accessState === "included" ? (
                <div className="mt-auto pt-8">
                  <Link href="/p/dashboard" className="cta-button cta-button--light w-full justify-center">
                    Open my Treeschool dashboard
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mt-auto pt-8">
                    <CurriculumCheckoutChoice
                      bundleSlug={bundle.slug}
                      bundlePrice={bundlePrice}
                      userEmail={user?.email ?? null}
                      triggerLabel="Try Treeschool for $6"
                      triggerStyle="green"
                    />
                  </div>
                  <Link href="/pricing" className="mt-4 text-center text-sm font-semibold text-[#486338] underline underline-offset-4">
                    Compare Single and Standard
                  </Link>
                </>
              )}
            </article>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e2d4bf] bg-[#f7f1e7]">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <p className="label-font text-center text-sm font-black uppercase tracking-[0.12em] text-earth">
            Questions parents ask
          </p>
          <h2 className="mt-3 text-center text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            The practical details.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] p-5">
                <summary className="cursor-pointer list-none pr-8 text-lg font-semibold marker:content-none">
                  {faq.question}
                  <span aria-hidden="true" className="float-right text-[#567b40] transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-7 text-ink/66">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#e8f0e1] px-4 py-14 text-center sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#486338]">
            A paper-first beginning
          </p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
            Give first grade a clear shape from the very first week.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-ink/68">
            Start with a complete set of printable books, then choose whether your family wants the curriculum alone or Treeschool beside you through the year.
          </p>
          <a href="#choose-your-path" className="cta-button cta-button--light mt-8">
            Choose your path
            <span aria-hidden="true">↑</span>
          </a>
        </div>
      </section>

      <footer className="bg-[#6f513e] text-[#f7eddf]">
        <div className="mx-auto grid w-full max-w-7xl gap-9 px-4 py-11 sm:px-6 md:grid-cols-[1.2fr_.8fr_.8fr] lg:px-8">
          <div>
            <div className="flex items-center">
              <Image src="/tree-icon.png" alt="" width={64} height={64} className="h-14 w-14 object-contain" />
              <span className="brand-logo text-[27px] font-semibold">treeschool</span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-7 text-[#f3e7d4]/76">
              A paper-first elementary homeschool program for families who want children learning from printed lessons, books, projects, and real life—not another screen.
            </p>
          </div>
          <div>
            <p className="label-font text-sm font-black uppercase text-[#dcc6a6]">First grade</p>
            <div className="mt-4 space-y-3 text-sm text-[#f3e7d4]/78">
              <Link href={PAGE_PATH} className="block hover:text-white">Complete curriculum</Link>
              <Link href="/first-grade-homeschool" className="block hover:text-white">First-grade starting guide</Link>
              <Link href={`/bookstore/${bundle.slug}`} className="block hover:text-white">Curriculum bundle details</Link>
            </div>
          </div>
          <div>
            <p className="label-font text-sm font-black uppercase text-[#dcc6a6]">Explore</p>
            <div className="mt-4 space-y-3 text-sm text-[#f3e7d4]/78">
              <Link href="/pricing" className="block hover:text-white">Pricing</Link>
              <Link href="/bookstore" className="block hover:text-white">Bookstore</Link>
              <Link href="/blog" className="block hover:text-white">Blog</Link>
              <Link href="/faq" className="block hover:text-white">FAQ</Link>
              <Link href="/support" className="block hover:text-white">Support</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-[#f3e7d4]/54">
          Copyright © 2026 Treeschool. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
