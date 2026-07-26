import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import { curriculumAreaLabel } from "../../../lib/native-workbooks/curriculum-areas";
import { formatNativeWorkbookGradeRange } from "../../../lib/native-workbooks/grades";
import { getNativeWorkbookProduct, listNativeWorkbookCatalog } from "../../../lib/native-workbooks/server";
import { startWorkbookCheckoutAction } from "../actions";
import { WorkbookImageGallery } from "./workbook-image-gallery";

const SITE_URL = "https://www.treehomeschool.com";

type Props = { params: { slug: string }; searchParams?: { checkout?: string; error?: string; addToLearningYearId?: string } };

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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

export default async function WorkbookProductPage({ params, searchParams }: Props) {
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
  const catalog = await listNativeWorkbookCatalog({ userId: user?.id, grade: null, subject: null }).catch(() => ({ workbooks: [] }));
  const relatedWorkbooks = catalog.workbooks
    .filter((item) => item.id !== workbook.id)
    .map((item) => ({
      item,
      score:
        (item.curriculumAreaKey === workbook.curriculumAreaKey ? 3 : 0)
        + (item.subjectKey === workbook.subjectKey ? 3 : 0)
        + (item.gradeMin <= workbook.gradeMax && item.gradeMax >= workbook.gradeMin ? 2 : 0)
        + (item.type === workbook.type ? 1 : 0)
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title))
    .slice(0, 4)
    .map(({ item }) => item);

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
      answer: `No. You can purchase the standalone PDF for ${price} without a membership. Enter your delivery email at checkout and Treeschool will send the download link after payment.`
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

  return (
    <main className="min-h-screen bg-[#f8f1e4] text-ink">
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

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-ink/55">
          <Link href="/" className="hover:text-[#567b40] hover:underline">Home</Link><span aria-hidden="true">/</span>
          <Link href="/bookstore" className="hover:text-[#567b40] hover:underline">Printable workbooks</Link><span aria-hidden="true">/</span>
          <span className="font-semibold text-ink/75" aria-current="page">{workbook.title}</span>
        </nav>

        {searchParams?.checkout === "canceled" ? <p className="mt-5 rounded-[16px] bg-[#fffaf2] px-4 py-3 text-sm font-semibold text-earth">Checkout was canceled. Nothing was charged.</p> : null}
        {searchParams?.error ? <p className="mt-5 rounded-[16px] bg-[#fff1ec] px-4 py-3 text-sm font-semibold text-[#8b3e2f]">{decodeURIComponent(searchParams.error)}</p> : null}

        <section className="mt-6 overflow-hidden rounded-[34px] border border-[#dcc8aa] bg-[#fffaf2] shadow-[0_12px_34px_rgba(91,63,39,0.08)] lg:grid lg:grid-cols-[0.82fr_1.18fr]">
          <div className="border-b border-[#dcc8aa] bg-[#f5ecdd] p-5 sm:p-8 lg:border-b-0 lg:border-r">
            <WorkbookImageGallery images={galleryImages} />
          </div>
          <div className="p-6 sm:p-10 lg:p-12">
            <p className="text-sm font-black uppercase tracking-[0.12em] text-[#567b40]">Printable {gradeLabel} {workbook.subjectLabel} homeschool {isBundle ? "curriculum" : "workbook"}</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.06] tracking-[-0.05em] sm:text-6xl">{workbook.title}</h1>
            <div className="mt-5 flex flex-wrap gap-2">
              {isBundle ? <span className="rounded-full bg-[#dfead4] px-3 py-1.5 text-xs font-bold text-[#4d6a39]">Bundle · {workbook.memberCount} workbooks</span> : null}
              <span className="rounded-full bg-[#eef5e4] px-3 py-1.5 text-xs font-bold text-[#4d6a39]">{workbook.type === "core" ? "Core subject" : "Elective"}</span>
              <span className="rounded-full bg-[#f2e6d3] px-3 py-1.5 text-xs font-bold text-earth">{gradeLabel}</span>
              {workbook.pageCount ? <span className="rounded-full border border-[#d8c7ad] bg-white px-3 py-1.5 text-xs font-bold text-ink/62">{workbook.pageCount.toLocaleString()} printable pages</span> : null}
            </div>
            <p className="mt-6 text-lg leading-8 text-ink/70">{workbook.description}</p>
            <p className="mt-7 text-4xl font-semibold tracking-[-0.04em]">{price}</p>
            <ul className="mt-5 grid gap-3 text-sm font-semibold text-ink/72 sm:grid-cols-3" aria-label="Purchase highlights">
              <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dfead4] text-[#4d6a39]">✓</span>Downloadable PDF</li>
              <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dfead4] text-[#4d6a39]">✓</span>Print at home</li>
              <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dfead4] text-[#4d6a39]">✓</span>Delivered by email</li>
            </ul>

            <div className="mt-8 rounded-[22px] border border-[#d8c7ad] bg-white p-5 sm:p-6">
              {owned ? <><p className="text-lg font-semibold text-[#4d6a39]">You own {isBundle ? "every workbook in this bundle" : "this workbook"}.</p><Link href="/p/purchased-workbooks" className="cta-button cta-button--light mt-4">Open Purchased Workbooks</Link></> : included ? <><p className="text-lg font-semibold text-[#4d6a39]">Included for lesson planning with your active Treeschool membership.</p><p className="mt-2 text-sm leading-6 text-ink/58">Add {isBundle ? "the collection" : "it"} directly from the lesson-plan generator. The standalone PDF{isBundle ? "s are sold separately and remain" : " is sold separately and remains"} yours permanently.</p><form action={startWorkbookCheckoutAction} className="mt-5"><input type="hidden" name="slug" value={workbook.slug} /><input type="hidden" name="email" value={user?.email ?? ""} /><button className="cta-button cta-button--outline">Buy {isBundle ? "bundle" : "standalone PDF"} · {price}</button></form></> : <form action={startWorkbookCheckoutAction}><input type="hidden" name="slug" value={workbook.slug} />{searchParams?.addToLearningYearId ? <input type="hidden" name="addToLearningYearId" value={searchParams.addToLearningYearId} /> : null}{!user ? <label className="grid gap-2 text-sm font-semibold">Where should we send your workbook?<input required name="email" type="email" autoComplete="email" placeholder="you@example.com" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" /></label> : <input type="hidden" name="email" value={user.email ?? ""} />}<button className="cta-button cta-button--dark mt-4 w-full justify-center">Buy and download · {price}</button><p className="mt-3 text-center text-xs leading-5 text-ink/48">Secure checkout by Stripe. A time-limited download link is emailed after payment.</p></form>}
            </div>
          </div>
        </section>

        <section className="grid gap-8 py-16 lg:grid-cols-[1.15fr_0.85fr]" aria-labelledby="workbook-overview-title">
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
                ["Language", languageLabel(workbook.languageCode)],
                ...(workbook.pageCount ? [["Length", `${workbook.pageCount.toLocaleString()} pages`]] : []),
                ["Delivery", "Secure link sent by email"]
              ].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-5 py-3"><dt className="text-ink/52">{label}</dt><dd className="text-right font-semibold">{value}</dd></div>)}
            </dl>
            <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
              <Link href={{ pathname: "/bookstore", query: { grade: workbook.gradeMin } }} className="text-[#567b40] underline underline-offset-4">More {gradeLabel} workbooks</Link>
              <Link href={{ pathname: "/bookstore", query: { subject: workbook.subjectLabel } }} className="text-[#567b40] underline underline-offset-4">More {workbook.subjectLabel}</Link>
            </div>
          </aside>
        </section>

        {isBundle && workbook.members?.length ? <section className="rounded-[30px] border border-[#cbd9bd] bg-[#eef5e4] p-6 sm:p-9"><p className="text-xs font-black uppercase tracking-[0.15em] text-[#567b40]">Complete collection</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">What’s included in {workbook.title}</h2><ul className="mt-6 grid gap-3 sm:grid-cols-2">{workbook.members.map((member) => <li key={member.id} className="rounded-[16px] border border-[#cbd9bd] bg-white px-4 py-3"><Link href={`/bookstore/${member.slug}`} className="font-semibold hover:text-[#567b40] hover:underline">{member.title}</Link><p className="mt-1 text-sm text-ink/55">{member.subjectLabel}{member.pageCount ? ` · ${member.pageCount} pages` : ""}</p></li>)}</ul></section> : null}

        <section className="py-16" aria-labelledby="how-it-works-title">
          <div className="text-center"><p className="text-xs font-black uppercase tracking-[0.15em] text-[#567b40]">Simple delivery</p><h2 id="how-it-works-title" className="mt-3 text-4xl font-semibold tracking-[-0.045em]">From checkout to the school table.</h2></div>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ["1", "Purchase securely", "Pay through Stripe using the email where you want your workbook delivered."],
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

        {relatedWorkbooks.length ? <section className="border-t border-[#dfcfb7] py-14" aria-labelledby="related-workbooks-title"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#567b40]">Keep exploring</p><h2 id="related-workbooks-title" className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Related printable homeschool workbooks</h2></div><Link href="/bookstore" className="font-semibold text-[#567b40] underline underline-offset-4">Browse the bookstore</Link></div><div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{relatedWorkbooks.map((related) => <article key={related.id}><Link href={`/bookstore/${related.slug}`} className="group block"><div className="relative aspect-[3/4] overflow-hidden rounded-[18px] border border-[#dcc8aa] bg-white shadow-[0_8px_20px_rgba(80,58,39,0.08)]">{related.thumbnailUrl ? <Image src={related.thumbnailUrl} alt={`${related.title} printable homeschool workbook cover`} fill unoptimized className="object-contain p-3 transition group-hover:scale-[1.02]" /> : <span className="absolute inset-0 grid place-items-center text-[#a9835c]">Printable workbook</span>}</div><h3 className="mt-4 text-xl font-semibold leading-tight group-hover:text-[#567b40] group-hover:underline">{related.title}</h3></Link><p className="mt-2 text-sm text-ink/55">{formatNativeWorkbookGradeRange(related.gradeMin, related.gradeMax)} · {related.subjectLabel}</p><p className="mt-2 font-semibold">{formatPrice(related.priceInCents, related.currencyCode)}</p></article>)}</div></section> : null}
      </div>

      <footer className="border-t border-[#e4d4bb] bg-[#fffaf2]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-ink/58 sm:px-6 lg:px-8"><p>Printable homeschool resources for grades K–4 and paper-first families.</p><nav className="flex flex-wrap gap-5"><Link href="/bookstore" className="hover:text-[#567b40]">Workbooks</Link><Link href="/pricing" className="hover:text-[#567b40]">Treeschool membership</Link><Link href="/blog" className="hover:text-[#567b40]">Homeschool resources</Link></nav></div>
      </footer>
    </main>
  );
}
