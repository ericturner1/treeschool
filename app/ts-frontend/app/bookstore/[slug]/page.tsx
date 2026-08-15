import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { curriculumAreaLabel } from "../../../lib/native-workbooks/curriculum-areas";
import { formatNativeWorkbookGradeRange } from "../../../lib/native-workbooks/grades";
import {
  getNativeWorkbookProduct,
  listNativeWorkbookCatalog,
  type NativeWorkbookCatalogItem
} from "../../../lib/native-workbooks/server";
import { ViewItemAnalytics } from "../../../components/commerce-analytics";
import { WorkbookGallery } from "../../../components/workbook-gallery";
import { startWorkbookCheckoutAction } from "../actions";
import { WorkbookImageGallery } from "./workbook-image-gallery";

const SITE_URL = "https://www.treehomeschool.com";

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ checkout?: string; error?: string; addToLearningYearId?: string }> };

function formatPrice(priceInCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(priceInCents / 100);
}

function languageLabel(languageCode: string) {
  const language = languageCode.trim().toLowerCase().split(/[-_]/)[0];
  return ({ en: "English", es: "Spanish", fr: "French", de: "German", ja: "Japanese" } as Record<string, string>)[language] ?? languageCode;
}

function absoluteUrl(value: string | null | undefined) {
  if (!value) return null;
  return value.startsWith("/") ? `${SITE_URL}${value}` : value;
}

function productDescription(input: {
  title: string;
  gradeLabel: string;
  subjectLabel: string;
  pageCount?: number | null;
  isBundle: boolean;
}) {
  const pages = input.pageCount ? ` with ${input.pageCount.toLocaleString()} printable pages` : "";
  return `${input.title} is a printable ${input.gradeLabel} ${input.subjectLabel.toLowerCase()} homeschool ${input.isBundle ? "workbook bundle" : "workbook"}${pages}. Download the PDF and teach with less screen time.`;
}

function BundleMemberGallery({
  member,
  caption = "",
  frameless = false
}: {
  member: NativeWorkbookCatalogItem;
  caption?: string;
  frameless?: boolean;
}) {
  const trimBrandRefreshCover = frameless && member.thumbnailUrl?.includes("/thumbnail/brand-refresh-");
  return (
    <WorkbookGallery
      title={member.title}
      cover={member.thumbnailUrl ? {
        url: member.thumbnailUrl,
        alt: `${member.title} printable workbook cover`,
        label: "Cover"
      } : null}
      images={(member.previewImages ?? []).map((image) => ({
        url: image.url,
        alt: `${member.title}: ${image.label}`,
        label: image.label
      }))}
      previewEndpoint={`/api/native-workbooks/product-previews?slug=${encodeURIComponent(member.slug)}`}
      caption={caption}
      sizes="(min-width: 1024px) 180px, (min-width: 640px) 24vw, 42vw"
      thumbnailClassName={frameless
        ? "aspect-[3/4] rounded-[16px]"
        : "aspect-[3/4] rounded-[16px] border border-[#d8c7ad] bg-white shadow-[0_8px_20px_rgba(80,58,39,0.1)]"}
      imageClassName={frameless ? "transition duration-200 group-hover:brightness-[0.52] group-focus-visible:brightness-[0.52]" : undefined}
      imageStyle={trimBrandRefreshCover ? {
        width: "106.83%",
        height: "113.6%",
        left: "-3.41%",
        top: "-3.01%",
        right: "auto",
        bottom: "auto",
        maxWidth: "none"
      } : undefined}
    />
  );
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const workbook = await getNativeWorkbookProduct({ slug: params.slug }).catch(() => null);
  if (!workbook) return { title: "Printable Homeschool Workbooks | Treeschool" };
  const gradeLabel = formatNativeWorkbookGradeRange(workbook.gradeMin, workbook.gradeMax);
  const isBundle = workbook.catalogKind === "bundle";
  const title = `${workbook.title} | Printable ${gradeLabel} Homeschool ${isBundle ? "Curriculum" : "Workbook"}`;
  const description = productDescription({ ...workbook, gradeLabel, isBundle });
  const canonical = `${SITE_URL}/bookstore/${workbook.slug}`;
  const images = absoluteUrl(workbook.thumbnailUrl)
    ? [{ url: absoluteUrl(workbook.thumbnailUrl)!, alt: `${workbook.title} printable homeschool ${isBundle ? "curriculum" : "workbook"} cover` }]
    : [];

  return {
    title,
    description,
    alternates: { canonical },
    keywords: [
      workbook.title,
      `printable ${gradeLabel.toLowerCase()} homeschool workbook`,
      `${workbook.subjectLabel.toLowerCase()} homeschool curriculum`,
      "paper-based homeschool program",
      "screen-free homeschool resources",
      ...workbook.coverageTags
    ],
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: "Treeschool",
      images
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images: images.map((image) => image.url)
    }
  };
}

export default async function WorkbookProductPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await getCurrentUser();
  const workbook = await getNativeWorkbookProduct({ slug: params.slug, userId: user?.id }).catch(() => null);
  if (!workbook) notFound();

  const included = workbook.accessState === "included";
  const owned = workbook.accessState === "owned";
  const isBundle = workbook.catalogKind === "bundle";
  const gradeLabel = formatNativeWorkbookGradeRange(workbook.gradeMin, workbook.gradeMax);
  const areaLabel = curriculumAreaLabel(workbook.curriculumAreaKey);
  const price = formatPrice(workbook.priceInCents, workbook.currencyCode);
  const productUrl = `${SITE_URL}/bookstore/${workbook.slug}`;
  const galleryImages = [
    ...(workbook.thumbnailUrl ? [{
      url: workbook.thumbnailUrl,
      alt: `${workbook.title} printable homeschool ${isBundle ? "curriculum" : "workbook"} cover`,
      label: "Cover"
    }] : []),
    ...(workbook.previewImages ?? []).map((preview) => ({
      url: preview.url,
      alt: `${workbook.title} sample page: ${preview.label}`,
      label: preview.label
    }))
  ];
  const catalog = isBundle
    ? await listNativeWorkbookCatalog({ userId: user?.id, grade: null, subject: null }).catch(() => ({ workbooks: [] }))
    : { workbooks: [] as NativeWorkbookCatalogItem[] };
  const catalogById = new Map(catalog.workbooks.map((item) => [item.id, item]));
  const bundleMembers = (workbook.members ?? []).flatMap((member) => {
    const product = catalogById.get(member.id);
    return product?.catalogKind === "workbook" ? [product] : [];
  });

  const productSchema = {
    "@context": "https://schema.org",
    "@type": isBundle ? ["Product", "LearningResource"] : ["Product", "Book", "LearningResource"],
    name: workbook.title,
    description: workbook.description,
    url: productUrl,
    image: [workbook.thumbnailUrl, ...(workbook.previewImages ?? []).map((image) => image.url)].filter(Boolean),
    sku: workbook.id,
    brand: { "@type": "Brand", name: "Treeschool" },
    category: `${gradeLabel} ${workbook.subjectLabel} homeschool ${isBundle ? "curriculum" : "workbook"}`,
    learningResourceType: isBundle ? "Printable homeschool curriculum" : "Printable homeschool workbook",
    educationalLevel: gradeLabel,
    inLanguage: workbook.languageCode,
    isFamilyFriendly: true,
    audience: { "@type": "EducationalAudience", educationalRole: "parent", audienceType: "Homeschool families" },
    ...(isBundle ? {} : { numberOfPages: workbook.pageCount ?? undefined }),
    additionalProperty: [
      { "@type": "PropertyValue", name: "Format", value: "Downloadable PDF" },
      { "@type": "PropertyValue", name: "Subject", value: workbook.subjectLabel },
      { "@type": "PropertyValue", name: "Grade level", value: gradeLabel },
      ...(workbook.pageCount ? [{ "@type": "PropertyValue", name: "Page count", value: workbook.pageCount }] : [])
    ],
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: workbook.currencyCode,
      price: (workbook.priceInCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Treeschool" }
    }
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Printable homeschool workbooks", item: `${SITE_URL}/bookstore` },
      { "@type": "ListItem", position: 3, name: workbook.title, item: productUrl }
    ]
  };
  const faqs = [
    {
      question: `Is ${workbook.title} a physical book?`,
      answer: `No. This is a downloadable PDF ${isBundle ? "collection" : "workbook"}. After purchase, Treeschool emails a secure download link so you can print the pages you need.`
    },
    {
      question: `What grade is this ${isBundle ? "curriculum" : "workbook"} for?`,
      answer: `${workbook.title} is designed for ${gradeLabel} learners. Parents can preview the sample pages above to decide whether the material fits their child.`
    },
    {
      question: "Do I need a Treeschool membership to buy it?",
      answer: `No. You can purchase the standalone PDF for ${price} without a membership. Stripe collects your delivery email during secure checkout, and Treeschool sends the download link after payment.`
    },
    {
      question: "Can I use it with the Treeschool lesson planner?",
      answer: workbook.type === "core"
        ? "Yes. Active Treeschool members can add this core material directly to a student's lesson plan. The planner organizes selected workbook material into printable weekly lesson plans."
        : "Yes. After purchasing this material, you can use it alongside your other homeschool workbooks in the Treeschool lesson planner."
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
  const purchaseHighlights = (stacked = false) => (
    <ul className={`mt-5 grid gap-3 text-left text-sm font-semibold text-ink/72 ${stacked ? "" : "sm:grid-cols-3"}`} aria-label="Purchase highlights">
      <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dfead4] text-[#4d6a39]">✓</span>Downloadable PDF</li>
      <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dfead4] text-[#4d6a39]">✓</span>Print at home</li>
      <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dfead4] text-[#4d6a39]">✓</span>Delivered by email</li>
    </ul>
  );

  return (
    <main className="min-h-screen bg-[#f8f1e4] text-ink">
      <ViewItemAnalytics
        currency={workbook.currencyCode}
        value={workbook.priceInCents / 100}
        item={{
          itemId: workbook.id,
          itemName: workbook.title,
          itemCategory: workbook.catalogKind,
          price: workbook.priceInCents / 100
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c") }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />

      <header className="border-b border-[#e4d4bb] bg-[#fffaf2]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/tree-icon.png" alt="" width={64} height={64} className="h-14 w-14 object-contain" />
            <span className="brand-logo text-[26px] font-semibold leading-none">treeschool</span>
          </Link>
          <nav className="flex items-center gap-4" aria-label="Bookstore navigation">
            <Link href="/bookstore" className="hidden text-sm font-semibold text-ink/65 sm:inline">All workbooks</Link>
            <Link href="/pricing" className="hidden text-sm font-semibold text-ink/65 transition-colors hover:text-ink lg:inline">Get our entire core curriculum for $20/month!</Link>
            <Link href={user ? "/p/dashboard" : "/p/signin"} className="cta-button cta-button--light cta-button--small">{user ? "My dashboard" : "Sign in"}</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-1 sm:px-6 lg:px-8">
        {searchParams?.checkout === "canceled" ? <p className="mt-5 rounded-[16px] bg-[#fffaf2] px-4 py-3 text-sm font-semibold text-earth">Checkout was canceled. Nothing was charged.</p> : null}
        {searchParams?.error ? <p className="mt-5 rounded-[16px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{decodeURIComponent(searchParams.error)}</p> : null}

        <section className="overflow-hidden rounded-[34px] lg:grid lg:grid-cols-2">
          <div className="p-5 sm:p-8">
            <WorkbookImageGallery
              images={galleryImages}
              primaryClassName={isBundle ? "mx-auto aspect-square w-full max-w-[280px] rounded-[20px]" : undefined}
              framelessPrimary={isBundle}
              showLabel={!isBundle}
            />
            {bundleMembers.length ? (
              <div className="mt-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {bundleMembers.map((member) => (
                    <div key={member.id} className="mx-auto w-[70%]">
                      <BundleMemberGallery member={member} frameless />
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-center text-sm leading-6 text-ink/58">Select a cover to browse its table of contents and sample pages.</p>
              </div>
            ) : null}
          </div>
          <div className="p-6 sm:p-10 lg:p-12">
            <h1 className="text-4xl font-semibold leading-[1.06] tracking-[-0.05em] sm:text-6xl">{workbook.title}</h1>
            {isBundle ? purchaseHighlights(true) : null}
            {!isBundle ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#eef5e4] px-3 py-1.5 text-xs font-bold text-[#4d6a39]">{workbook.type === "core" ? "Core subject" : "Elective"}</span>
                <span className="rounded-full bg-[#f2e6d3] px-3 py-1.5 text-xs font-bold text-earth">{gradeLabel}</span>
                {workbook.pageCount ? <span className="rounded-full border border-[#d8c7ad] bg-white px-3 py-1.5 text-xs font-bold text-ink/62">{workbook.pageCount.toLocaleString()} printable pages</span> : null}
              </div>
            ) : null}
            <p className="mt-6 text-lg leading-8 text-ink/70">{workbook.description}</p>
            {!isBundle ? purchaseHighlights() : null}

            <div className={isBundle ? "mt-8" : "mt-8 rounded-[22px] border border-[#d8c7ad] bg-white p-5 sm:p-6"}>
              {owned ? <><p className="text-lg font-semibold text-[#4d6a39]">You own {isBundle ? "every workbook in this bundle" : "this workbook"}.</p><Link href="/p/purchased-workbooks" className="cta-button cta-button--light mt-4">Open Purchased Workbooks</Link></> : included ? <><p className="text-lg font-semibold text-[#4d6a39]">Included for lesson planning with your active Treeschool membership.</p><p className="mt-2 text-sm leading-6 text-ink/58">Add {isBundle ? "the collection" : "it"} directly from the lesson-plan generator. The standalone PDF{isBundle ? "s are sold separately and remain" : " is sold separately and remains"} yours permanently.</p><form action={startWorkbookCheckoutAction} className="mt-5" data-revenue-path="bookstore-product" data-analytics-item-id={workbook.id} data-analytics-item-name={workbook.title} data-analytics-item-category={workbook.catalogKind} data-analytics-currency={workbook.currencyCode} data-analytics-value={(workbook.priceInCents / 100).toFixed(2)}><input type="hidden" name="slug" value={workbook.slug} /><input type="hidden" name="email" value={user?.email ?? ""} /><button className="cta-button cta-button--outline">Buy {isBundle ? "bundle" : "standalone PDF"} · {price}</button></form></> : <form action={startWorkbookCheckoutAction} data-revenue-path="bookstore-product" data-analytics-item-id={workbook.id} data-analytics-item-name={workbook.title} data-analytics-item-category={workbook.catalogKind} data-analytics-currency={workbook.currencyCode} data-analytics-value={(workbook.priceInCents / 100).toFixed(2)}><input type="hidden" name="slug" value={workbook.slug} />{searchParams?.addToLearningYearId ? <input type="hidden" name="addToLearningYearId" value={searchParams.addToLearningYearId} /> : null}{user ? <input type="hidden" name="email" value={user.email ?? ""} /> : null}<button className="cta-button cta-button--dark w-full justify-center">Buy and download · {price}</button><p className="mt-3 text-center text-xs leading-5 text-ink/48">Secure checkout by Stripe. Enter your delivery email there, then receive a time-limited download link after payment.</p></form>}
            </div>
          </div>
        </section>

        {bundleMembers.length ? (
          <section className="rounded-[30px] border border-[#cbd9bd] bg-[#eef5e4] p-6 sm:p-9">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-[#567b40]">Complete collection</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">What’s included in {workbook.title}</h2>
            <div className="mt-7 grid gap-5 lg:grid-cols-2">
              {bundleMembers.map((member) => (
                <article key={member.id} className="grid gap-5 rounded-[22px] border border-[#cbd9bd] bg-white p-5 sm:grid-cols-[150px_1fr] sm:items-start">
                  <BundleMemberGallery member={member} />
                  <div>
                    <h3 className="text-2xl font-semibold tracking-[-0.035em]">{member.title}</h3>
                    <p className="mt-2 text-sm font-semibold text-[#567b40]">{member.subjectLabel}{member.pageCount ? ` · ${member.pageCount.toLocaleString()} pages` : ""}</p>
                    <p className="mt-4 leading-7 text-ink/65">{member.description}</p>
                    <p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-ink/42">Select the cover to view sample pages</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="relative left-1/2 my-10 w-screen -translate-x-1/2 bg-[#e7efdd] py-12 sm:py-14" aria-labelledby="workbook-overview-title">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.15em] text-[#567b40]">Paper-first homeschooling</p>
              <h2 id="workbook-overview-title" className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">A printable resource for learning away from the screen.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-ink/68">{workbook.title} gives homeschool parents a concrete {workbook.subjectLabel.toLowerCase()} resource they can hold, mark up, and teach from. Download the PDF, print the pages you need, and keep the lesson at the kitchen table instead of moving your child onto another app.</p>
              {workbook.coverageTags.length ? <div className="mt-7"><h3 className="text-lg font-semibold">Topics and skills</h3><div className="mt-3 flex flex-wrap gap-2">{workbook.coverageTags.map((tag) => <span key={tag} className="rounded-full border border-[#c8d9b8] bg-[#f2f7ed] px-3 py-1.5 text-sm font-semibold text-[#4d6a39]">{tag}</span>)}</div></div> : null}
            </div>
            <aside className="rounded-[26px] border border-[#dcc8aa] bg-[#fffaf2] p-6 sm:p-8" aria-label="Workbook details">
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">Workbook details</h2>
              <dl className="mt-5 divide-y divide-[#e4d4bb] text-sm">
                {[
                  ["Format", "Printable PDF download"],
                  ["Grade level", gradeLabel],
                  ["Subject", workbook.subjectLabel],
                  ["Curriculum area", areaLabel],
                  ["Language of Workbook", languageLabel(workbook.languageCode)],
                  ...(workbook.pageCount ? [["Length", `${workbook.pageCount.toLocaleString()} pages`]] : []),
                  ["Delivery", "Secure link sent by email"]
                ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-5 py-3"><dt className="text-ink/52">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
              </dl>
            </aside>
          </div>
        </section>

        <section className="py-16" aria-labelledby="how-it-works-title">
          <div className="text-center"><p className="text-xs font-black uppercase tracking-[0.15em] text-[#567b40]">Simple delivery</p><h2 id="how-it-works-title" className="mt-3 text-4xl font-semibold tracking-[-0.045em]">From checkout to the school table.</h2></div>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ["1", "Purchase securely", "Stripe securely collects your payment and delivery email in one checkout."],
              ["2", "Download and print", "Open the secure link from your email and print the pages that fit your homeschool routine."],
              ["3", "Teach your way", "Use the workbook on its own or organize it into a year of printable weekly plans with Treeschool."]
            ].map(([number, title, copy]) => <li key={number} className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] p-6"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#dfead4] font-black text-[#4d6a39]">{number}</span><h3 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">{title}</h3><p className="mt-3 leading-7 text-ink/62">{copy}</p></li>)}
          </ol>
        </section>

        <section className="rounded-[30px] bg-[#5d7f48] px-6 py-10 text-white sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div><p className="text-sm font-bold uppercase tracking-[0.12em] text-white/70">K–4 elementary homeschool program</p><h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Turn your chosen curriculum into printable weekly lesson plans.</h2><p className="mt-3 max-w-2xl leading-7 text-white/78">Treeschool organizes PDF workbooks by week and day, helps parents track progress, and keeps children from being glued to another screen.</p></div>
          <Link href="/homeschool-lesson-plan-generator" className="cta-button cta-button--light mt-6 shrink-0 lg:mt-0">Build your lesson plan</Link>
        </section>

        <section className="py-16" aria-labelledby="faq-title">
          <p className="text-xs font-black uppercase tracking-[0.15em] text-[#567b40]">Questions from homeschool parents</p>
          <h2 id="faq-title" className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Frequently asked questions</h2>
          <div className="mt-7 grid gap-4 lg:grid-cols-2">{faqs.map((faq) => <details key={faq.question} className="group rounded-[20px] border border-[#dcc8aa] bg-[#fffaf2] p-5"><summary className="cursor-pointer list-none pr-8 text-lg font-semibold marker:content-none">{faq.question}<span className="float-right text-[#567b40] group-open:rotate-45">+</span></summary><p className="mt-4 leading-7 text-ink/65">{faq.answer}</p></details>)}</div>
        </section>

      </div>

      <footer className="border-t border-[#e4d4bb] bg-[#fffaf2]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-ink/58 sm:px-6 lg:px-8"><p>Printable homeschool resources for grades K–4 and paper-first families.</p><nav className="flex flex-wrap gap-5"><Link href="/bookstore" className="hover:text-[#567b40]">Workbooks</Link><Link href="/pricing" className="hover:text-[#567b40]">Treeschool membership</Link><Link href="/blog" className="hover:text-[#567b40]">Homeschool resources</Link><Link href="/faq" className="hover:text-[#567b40]">FAQ</Link></nav></div>
      </footer>
    </main>
  );
}
