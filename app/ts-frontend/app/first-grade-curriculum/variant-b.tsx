import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/server";
import {
  formatCurriculumPrice,
  getFirstGradeMarketingCoverPath,
  selectFirstGradeBundle
} from "../../lib/first-grade-curriculum/catalog";
import type { FirstGradeCurriculumVariant } from "../../lib/first-grade-curriculum/experiment";
import {
  listNativeWorkbookCatalog,
  type NativeWorkbookCatalogItem
} from "../../lib/native-workbooks/server";
import { CurriculumCheckoutChoice } from "../first-grade-homeschool-curriculum/curriculum-checkout-choice";
import {
  CurriculumBundleCover,
  WorkbookCover
} from "../first-grade-homeschool-curriculum/workbook-cover";
import { FunnelExperimentTracker } from "./funnel-experiment-tracker";

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

type Props = {
  searchParams?: {
    checkout?: string;
    error?: string;
    preview_variant?: string;
  };
  experiment: {
    landingVariant: FirstGradeCurriculumVariant;
    funnelVisitorId: string | null;
    previewMode: boolean;
  };
};

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-[#dce9cf] text-xs font-black text-[#486338]"
      >
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

export async function FirstGradeCurriculumVariantB({
  searchParams,
  experiment
}: Props) {
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
  const checkoutMessage =
    searchParams?.checkout === "canceled"
      ? "Checkout was canceled. Nothing was charged."
      : searchParams?.error
        ? searchParams.error
        : null;

  const checkout = (label: string, style: "green" | "dark" = "green") =>
    bundle?.accessState === "owned" ? (
      <Link
        href="/p/purchased-workbooks"
        className="cta-button cta-button--light w-full justify-center"
        data-funnel-cta="open-owned-workbooks"
      >
        Open my purchased workbooks
        <Arrow />
      </Link>
    ) : bundle && bundlePrice ? (
      <CurriculumCheckoutChoice
        bundleSlug={bundle.slug}
        bundlePrice={bundlePrice}
        bundlePriceInCents={bundle.priceInCents}
        currencyCode={bundle.currencyCode}
        userEmail={user?.email ?? null}
        triggerLabel={label}
        triggerStyle={style}
        returnPath={PAGE_PATH}
        landingVariant={experiment.landingVariant}
        funnelVisitorId={experiment.funnelVisitorId}
        previewMode={experiment.previewMode}
      />
    ) : (
      <div className="rounded-[16px] border border-[#9db887] bg-white/65 px-5 py-4 text-center text-sm font-semibold text-[#486338]">
        Curriculum preview — checkout becomes available when the catalog is connected.
      </div>
    );

  return (
    <main className="min-h-screen bg-[#fbf7ef] text-ink">
      <FunnelExperimentTracker
        variant={experiment.landingVariant}
        preview={experiment.previewMode}
        visitorId={experiment.funnelVisitorId}
      />

      <header className="border-b border-[#dfcfb8] bg-[#fffaf2]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-1">
            <Image
              src="/tree-icon.png"
              alt="Treeschool"
              width={58}
              height={58}
              className="h-12 w-12 object-contain"
              priority
            />
            <span className="brand-logo text-[25px] font-semibold leading-none">
              treeschool
            </span>
          </Link>
          <Link
            href={user ? "/p/dashboard" : "/p/signin"}
            className="text-sm font-semibold text-ink/60 underline decoration-[#bba486] underline-offset-4 transition hover:text-ink"
          >
            {user ? (
              "Open dashboard"
            ) : (
              <>
                <span className="sm:hidden">Sign in</span>
                <span className="hidden sm:inline">Already a customer? Sign in</span>
              </>
            )}
          </Link>
        </div>
      </header>

      {checkoutMessage ? (
        <div className="border-b border-[#e3cfaf] bg-[#fff6e7] px-4 py-3 text-center text-sm font-semibold text-[#77512f]">
          {checkoutMessage}
        </div>
      ) : null}

      <section className="border-b border-[#bfd0af] bg-[#e7f0df]">
        <div className="mx-auto w-full max-w-5xl px-4 py-10 text-center sm:px-6 sm:py-14">
          <p className="label-font mx-auto inline-flex rounded-full border border-[#9db887] bg-white/65 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#486338] sm:text-sm">
            A complete, printable first-grade homeschool curriculum
          </p>
          <h1 className="mx-auto mt-5 max-w-4xl text-[42px] font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[68px]">
            Stop piecing first grade together one worksheet at a time.
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-ink/72 sm:text-xl">
            Give your child a coordinated year of reading, language arts,
            math, science, and social studies—without handing childhood over
            to another screen.
          </p>

          <div className="mx-auto mt-8 grid max-w-4xl gap-8 rounded-[30px] border border-[#a9c095] bg-[#fffaf2] p-5 text-left shadow-[0_22px_55px_rgba(72,99,56,.13)] sm:p-7 md:grid-cols-[270px_minmax(0,1fr)] md:items-center">
            <div className="mx-auto w-full max-w-[270px]">
              <CurriculumBundleCover
                title={bundle?.title ?? "Complete First-Grade Curriculum"}
                src={bundle?.thumbnailUrl ?? null}
                priority
              />
            </div>
            <div>
              <p className="label-font text-sm font-black uppercase tracking-[0.09em] text-earth">
                One purchase. One clear starting point.
              </p>
              <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">
                Your first-grade core year, ready to print.
              </h2>
              <ul className="mt-5 grid gap-3 text-base leading-7 text-ink/72">
                <Check>{memberCount} coordinated PDF workbooks</Check>
                <Check>Core instruction across five subject areas</Check>
                <Check>Immediate digital delivery after checkout</Check>
                <Check>No subscription required</Check>
              </ul>
              <div className="mt-6">
                {checkout(
                  bundlePrice
                    ? `Get the complete curriculum · ${bundlePrice}`
                    : "Get the complete curriculum"
                )}
              </div>
              <p className="mt-3 text-center text-xs font-semibold text-ink/48">
                Secure Stripe checkout · Printable PDFs · Files are yours to keep
              </p>
            </div>
          </div>
        </div>
      </section>

      <article className="mx-auto w-full max-w-[820px] px-4 py-14 sm:px-6 sm:py-16">
        <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
          Dear homeschool parent,
        </p>
        <div className="mt-4 space-y-5 text-[18px] leading-8 text-ink/74">
          <p>
            You did not choose homeschooling so you could spend every Sunday
            night searching the internet for something to teach on Monday.
          </p>
          <p>
            Yet that is where many first-grade parents end up. A phonics page
            from one website. A math packet from another. A science activity
            saved somewhere on a phone. Three browser tabs about social
            studies—and a nagging question that never quite goes away:
            <strong className="font-semibold text-ink">
              {" "}“Am I covering what my child actually needs?”
            </strong>
          </p>
          <p>
            The problem is not that parents are unwilling to work. The problem
            is that an endless pile of disconnected resources asks you to be a
            curriculum department before you can simply be your child’s
            teacher.
          </p>
          <p>
            And when the easiest alternative is another all-day online
            program, you face a second bad choice: trade your planning burden
            for more screen time, more passwords, more digital distraction,
            and a child who experiences school through a glowing rectangle.
          </p>
        </div>

        <aside className="my-10 rounded-[26px] border-l-[6px] border-[#769d58] bg-[#edf5e6] px-6 py-7 sm:px-8">
          <p className="text-2xl font-semibold leading-9 tracking-[-0.035em] text-[#405d31]">
            First grade can be simpler than that.
          </p>
          <p className="mt-3 text-lg leading-8 text-ink/70">
            You can begin with the core subjects gathered in one place, print
            the work you need, sit beside your child, and teach from paper.
          </p>
        </aside>

        <div className="space-y-5 text-[18px] leading-8 text-ink/74">
          <p>
            That is why we created Treeschool’s complete first-grade core
            curriculum: a coordinated set of printable PDF workbooks for
            families who want a real academic foundation without building
            their home around a screen.
          </p>
          <p>
            It gives you a ready-made foundation in reading, phonics, spelling,
            writing and grammar, mathematics, science, and social studies. You
            remain in charge. You decide when to teach, how quickly to move,
            what to repeat, and when your child is ready for more.
          </p>
          <p>
            Treeschool does not attempt to replace a parent. It gives the
            parent something useful to teach.
          </p>
        </div>
      </article>

      <section className="border-y border-[#dfcfb8] bg-[#fffaf2]">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="grid gap-9 md:grid-cols-[.9fr_1.1fr] md:items-start">
            <div>
              <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
                The hidden cost of “free”
              </p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
                A worksheet is only free until you have to build a year around it.
              </h2>
            </div>
            <div className="space-y-5 text-lg leading-8 text-ink/70">
              <p>
                There is no shortage of material online. That is exactly what
                makes the search so exhausting. Every new download creates
                another decision: Is this at the right level? Did we already
                teach this? What should come before it? What comes after it?
                Does it leave a gap somewhere else?
              </p>
              <p>
                One isolated page may take only a minute to find. Multiply that
                search across reading, spelling, writing, math, science, and
                social studies—then repeat it week after week. The real price
                is paid in your evenings, your attention, and your confidence.
              </p>
              <p>
                A coordinated curriculum changes the job. Instead of inventing
                first grade while you teach it, you begin with a defined body
                of work. You can see what is included, understand the
                progression, and make thoughtful changes from a position of
                clarity.
              </p>
            </div>
          </div>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {[
              [
                "Less searching",
                "Open the collection instead of beginning every lesson with a browser."
              ],
              [
                "Fewer gaps",
                "Work from a core that brings the principal first-grade subjects together."
              ],
              [
                "More authority",
                "Adapt a visible curriculum to your child instead of obeying an app’s pace."
              ]
            ].map(([title, copy]) => (
              <article
                key={title}
                className="rounded-[22px] border border-[#dcc8aa] bg-[#fbf7ef] p-5"
              >
                <h3 className="text-xl font-semibold tracking-[-0.035em]">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-ink/62">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#c6d5b8] bg-[#edf5e7]">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-[#486338]">
              Look before you buy
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
              These are the actual workbooks you receive.
            </h2>
            <p className="mt-4 text-lg leading-8 text-ink/64">
              This is not a promise that a library will be completed later.
              The curriculum is already here, and the PDF collection is
              delivered after purchase.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6">
            {displayMembers.slice(0, 12).map((workbook, index) => (
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
          <p className="mx-auto mt-8 max-w-3xl text-center text-sm leading-7 text-ink/58">
            {memberCount} printable workbooks
            {totalPages ? ` · ${totalPages.toLocaleString()} curriculum pages` : ""}
            . Print a complete workbook, a lesson at a time, or only the pages
            that suit your child.
          </p>
        </div>
      </section>

      <section className="border-b border-[#dfcfb8] bg-[#fbf7ef]">
        <div className="mx-auto w-full max-w-[820px] px-4 py-14 sm:px-6 sm:py-16">
          <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
            What “complete” means for your family
          </p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
            A foundation to teach from—not a system that takes over your home.
          </h2>
          <div className="mt-7 space-y-5 text-[18px] leading-8 text-ink/72">
            <p>
              “Complete” does not mean that every family must look alike.
              Homeschooling would lose much of its purpose if a curriculum
              tried to decide every book, belief, conversation, outing, and
              interest for you.
            </p>
            <p>
              It means the academic core is present. You are not buying one
              attractive math workbook and discovering later that you still
              need to solve reading, spelling, writing, science, and social
              studies. The collection gives you material in each of those
              areas from the beginning.
            </p>
            <p>
              Around that core, your family remains free. Read library books
              on the sofa. Practice handwriting at the kitchen table. Grow a
              garden, visit a museum, study Scripture, learn an instrument,
              help with a family business, or spend an afternoon following a
              question your child cannot stop asking.
            </p>
            <p>
              Those experiences do not compete with a curriculum. A good core
              makes room for them by reducing the time you spend wondering
              whether basic academic work has been forgotten.
            </p>
            <p>
              And because the workbooks are PDFs, the collection bends with
              real life. If a lesson is easy, move forward. If your child needs
              another day, take it. If a page is unnecessary, do not print it.
              If a grandparent wants to help, hand them the lesson. Your files
              do not close because a billing period ended.
            </p>
            <p>
              You are still the teacher. Treeschool simply helps you begin
              more prepared and more confident.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="text-center">
          <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
            What the curriculum covers
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            The first-grade core, without the scavenger hunt.
          </h2>
        </div>

        <div className="mt-9 grid gap-5 sm:grid-cols-2">
          {[
            [
              "Reading, phonics & spelling",
              "Children build early reading fluency through phonics, progressive readers, comprehension practice, spelling, and repeated contact with written language. The reading levels provide a visible path forward instead of a random collection of passages."
            ],
            [
              "Writing & grammar",
              "A dedicated workbook introduces sentence construction, capitalization, punctuation, parts of speech, and written expression. Your child does not merely tap the right answer; they practice forming ideas with a pencil."
            ],
            [
              "Mathematics",
              "The math workbook develops first-grade foundations through number sense, addition and subtraction, measurement, time, data, equations, and age-appropriate geometry. Lessons are presented in teachable pieces that can be practiced on paper."
            ],
            [
              "Science & social studies",
              "Science helps children observe plants, animals, light, sound, the sky, and the physical world. Social studies introduces community, citizenship, geography, history, needs, wants, and the structures children encounter in everyday life."
            ]
          ].map(([title, copy]) => (
            <article
              key={title}
              className="rounded-[24px] border border-[#dcc8aa] bg-[#fffaf2] p-6 shadow-[0_10px_24px_rgba(80,58,39,.055)]"
            >
              <h3 className="text-2xl font-semibold tracking-[-0.04em]">{title}</h3>
              <p className="mt-3 text-base leading-8 text-ink/66">{copy}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href={DETAILS_PATH}
            className="inline-flex items-center gap-2 font-semibold text-[#486338] underline decoration-[#8cab75] underline-offset-4"
            data-funnel-cta="view-detailed-coverage"
          >
            See every workbook and the detailed curriculum coverage
            <Arrow />
          </Link>
        </div>
      </section>

      <section className="border-y border-[#dbc6aa] bg-[#f2e4d2]">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_1.1fr] md:items-center">
          <div>
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
              The paper-first difference
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em]">
              The screen can be a tool. It should not become the classroom.
            </h2>
          </div>
          <div className="space-y-4 text-lg leading-8 text-ink/70">
            <p>
              Young children already encounter screens everywhere. School does
              not have to add hours more. Printed work gives a child space to
              write, draw, point, erase, turn pages, and work beside a parent.
            </p>
            <p>
              Your child does not need an app login to complete these lessons.
              You download the PDFs, print what you choose, and keep the
              attention where it belongs: on the child, the parent, and the
              work in front of them.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[820px] px-4 py-14 sm:px-6 sm:py-16">
        <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
          How your first week can begin
        </p>
        <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
          No complicated setup. No waiting for a box.
        </h2>
        <div className="mt-7 space-y-6 text-[18px] leading-8 text-ink/72">
          <p>
            After checkout, your printable PDF workbooks are delivered
            digitally. Open the files, look through the lessons, and decide
            what your child will begin with.
          </p>
          <ol className="grid gap-4">
            {[
              [
                "Download the collection.",
                "Keep a secure digital copy of the workbooks you purchased."
              ],
              [
                "Choose the first lessons.",
                "Start at the appropriate point and move at the pace your child actually needs."
              ],
              [
                "Print and teach.",
                "Print full workbooks, weekly batches, or selected pages—and add books, projects, nature walks, field trips, or family priorities around the core."
              ]
            ].map(([title, copy], index) => (
              <li
                key={title}
                className="grid gap-4 rounded-[22px] border border-[#dfcfb8] bg-[#fffaf2] p-5 sm:grid-cols-[46px_1fr]"
              >
                <span className="label-font grid h-11 w-11 place-items-center rounded-full bg-[#75563f] font-black text-white">
                  {index + 1}
                </span>
                <div>
                  <strong className="font-semibold text-ink">{title}</strong>
                  <span> {copy}</span>
                </div>
              </li>
            ))}
          </ol>
          <p>
            If you would also like Treeschool to organize the materials into
            weekly lesson plans and help you track attendance, grades,
            progress, points, and streaks, you will see that option before
            checkout. If not, simply choose the one-time curriculum purchase.
          </p>
        </div>
      </section>

      <section className="border-y border-[#b7cba4] bg-[#e7f0df]">
        <div className="mx-auto grid w-full max-w-5xl gap-7 px-4 py-12 sm:px-6 md:grid-cols-[1fr_360px] md:items-center">
          <div>
            <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-[#486338]">
              A complete core foundation
            </p>
            <h2 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.05em]">
              Put the year’s core work on your shelf—without filling another subscription cart.
            </h2>
            <p className="mt-4 text-lg leading-8 text-ink/66">
              {memberCount} printable PDF workbooks
              {totalPages ? ` · ${totalPages.toLocaleString()} curriculum pages` : ""}
              {bundlePrice ? ` · ${bundlePrice} one-time purchase` : " · one-time purchase"}.
            </p>
          </div>
          <div>
            {checkout(
              bundlePrice
                ? `Get the complete curriculum · ${bundlePrice}`
                : "Get the complete curriculum"
            )}
            <p className="mt-3 text-center text-xs font-semibold text-ink/48">
              You will review the curriculum-only and planning options before
              entering payment details.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[820px] px-4 py-14 sm:px-6 sm:py-16">
        <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
          An honest word about fit
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">
          This curriculum is for you if…
        </h2>
        <div className="mt-7 grid gap-7 sm:grid-cols-2">
          <div>
            <h3 className="text-xl font-semibold text-[#486338]">It may be a good fit when you want:</h3>
            <ul className="mt-4 grid gap-3 text-base leading-7 text-ink/68">
              <Check>A paper-first first-grade core</Check>
              <Check>Printable files you can keep</Check>
              <Check>Freedom to set your own schedule</Check>
              <Check>Clear academic material without a child-facing app</Check>
              <Check>Room to add faith, family, culture, or electives</Check>
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-[#8a5a3d]">It may not be a fit when you want:</h3>
            <ul className="mt-4 grid gap-3 text-base leading-7 text-ink/68">
              <li>A video teacher to lead every lesson</li>
              <li>An accredited school or legal compliance service</li>
              <li>A child-led game or entertainment app</li>
              <li>A physical package shipped to your door</li>
              <li>A rigid daily schedule chosen by someone else</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-[#dfcfb8] bg-[#fffaf2]">
        <div className="mx-auto w-full max-w-[820px] px-4 py-14 sm:px-6 sm:py-16">
          <p className="label-font text-center text-sm font-black uppercase tracking-[0.1em] text-earth">
            Questions before you begin
          </p>
          <h2 className="mt-3 text-center text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Straight answers for parents.
          </h2>
          <div className="mt-8 grid gap-4">
            {[
              [
                "Is this really a complete first-grade curriculum?",
                "It is a complete first-grade core curriculum for reading and language arts, mathematics, science, and social studies. Homeschool families can add religious study, arts, music, physical activity, foreign language, field trips, or other family priorities."
              ],
              [
                "Are these physical books?",
                "They are downloadable PDF workbooks. No box is shipped. You can begin immediately and print full books or only the lessons you need."
              ],
              [
                "Will my child need to use a computer?",
                "No. The workbooks are designed to be printed and completed on paper. A parent can use Treeschool online if the optional planning membership is selected, but the lessons themselves do not require a child-facing app."
              ],
              [
                "Do I have to follow a fixed calendar?",
                "No. You own the PDF files and can teach them on the schedule that fits your family. Pause, repeat, move faster, or spend longer on a subject."
              ],
              [
                "Am I beginning a subscription?",
                bundlePrice
                  ? `Not unless you choose one. You can buy the curriculum alone for ${bundlePrice} as a one-time purchase. The checkout-choice screen also explains the optional Treeschool planning membership before any payment details are entered.`
                  : "Not unless you choose one. The curriculum is available as a one-time purchase, and any optional Treeschool planning membership is clearly presented before payment."
              ],
              [
                "What if we already own some resources?",
                "Keep using them. This curriculum can become your core foundation while your favorite books, activities, religious materials, and family projects remain part of your homeschool."
              ]
            ].map(([question, answer]) => (
              <details
                key={question}
                className="group rounded-[22px] border border-[#dcc8aa] bg-[#fbf7ef] p-5"
              >
                <summary className="cursor-pointer list-none pr-8 text-lg font-semibold marker:content-none">
                  {question}
                  <span
                    aria-hidden="true"
                    className="float-right text-[#567b40] transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-4 text-base leading-7 text-ink/66">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#dfead5] px-4 py-14 text-center sm:px-6 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Image
            src="/tree-icon.png"
            alt=""
            width={72}
            height={72}
            className="mx-auto h-16 w-16 object-contain"
          />
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.05em] sm:text-5xl">
            Tomorrow’s lesson does not have to begin with another search.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-ink/68">
            Bring the first-grade core together today. Download the collection,
            print the first lesson, and give yourself the relief of knowing
            what comes next.
          </p>
          <div className="mx-auto mt-7 max-w-[460px]">
            {checkout(
              bundlePrice
                ? `Get the complete curriculum · ${bundlePrice}`
                : "Get the complete curriculum"
            )}
          </div>
        </div>
      </section>

      <footer className="bg-[#6f513e] px-4 py-7 text-center text-sm text-[#fff8ee] sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p>Copyright © 2026 Treeschool. Paper-first homeschool for grades K–4.</p>
          <div className="flex flex-wrap justify-center gap-5">
            <Link href="/faq" className="hover:text-white">FAQ</Link>
            <Link href="/refunds" className="hover:text-white">Refunds</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/support" className="hover:text-white">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
