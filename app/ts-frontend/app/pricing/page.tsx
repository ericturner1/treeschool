import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { startPricingSubscriptionCheckoutAction } from "../billing-actions";
import { getCurrentUser } from "../../lib/auth/server";
import { getRequestDictionary } from "../../lib/i18n/server";
import { MembershipPlanCards } from "./membership-plan-card";

export const metadata: Metadata = {
  title: "Elementary Homeschool Program Pricing for Grades K–4 | Treeschool",
  description: "See Treeschool pricing for a paper-first elementary homeschooling program for grades K–4, with printable lesson plans, curriculum tools, attendance, progress, and optional grades."
};

type PricingPageProps = {
  searchParams?: Promise<{
    lang?: string;
    checkout?: string;
    error?: string;
    message?: string;
  }>;
};

const membershipFeatures = [
  {
    title: "Printable lesson plans built around your curriculum",
    copy: "Use your own workbook PDFs, included Treeschool core books, or both. Treeschool organizes them into weekly and day-by-day plans."
  },
  {
    title: "Academic curriculum review",
    copy: "Check core subject coverage before planning and quickly add matching Treeschool workbooks when something important is missing."
  },
  {
    title: "Weekly or individual-day PDF downloads",
    copy: "Print one complete week or separate school-day files, with original workbook pages preserved and every subject kept together."
  },
  {
    title: "Progress and attendance",
    copy: "Mark lessons and days done, see school-year pace, and record field trips, co-ops, projects, and other learning outside the plan."
  },
  {
    title: "Motivating points and learning streaks",
    copy: "Celebrate consistency with streaks that respect planned days off. Award customizable points manually or automatically as lessons are finished, then use them for family-chosen rewards and privileges."
  },
  {
    title: "Optional grades and reports",
    copy: "Record scores only when useful, see automatic letter grades, and review results across subjects and school years."
  },
  {
    title: "Student profiles that fit your plan",
    copy: "Single keeps one child organized. Standard includes up to three children, each with separate plans, progress, attendance, and grades."
  },
  {
    title: "Invite other parents and teachers",
    copy: "Single includes up to two Teacher users; Standard includes up to four. They can help teach, record attendance, add grades, and mark lessons done—without permission to delete your family’s data."
  },
  {
    title: "Safe updates when plans change",
    copy: "After the introductory month, update future work up to five times per billing month without losing started or completed weeks."
  },
  {
    title: "Paper-first learning",
    copy: "Parents get a modern planning workspace while children can learn from printed lessons, books, projects, and real life—not another screen."
  }
];

const faqs = [
  {
    question: "Do I need to use Treeschool curriculum?",
    answer: "No. Treeschool is designed around the curriculum and workbook PDFs your family has already chosen. Included Treeschool core books can fill gaps, but they are not required."
  },
  {
    question: "What does paper-first mean?",
    answer: "Parents use Treeschool to plan and keep records online, then print what the child needs. It is designed to reduce daily screen time and help children escape the constant influence of the screen through physical workbooks, projects, field trips, and real-world learning."
  },
  {
    question: "Can I choose our teaching schedule?",
    answer: "Yes. Choose the number of teaching weeks and days per week, then optionally set how often individual subjects should appear."
  },
  {
    question: "Can I manage more than one child?",
    answer: "Yes. Choose Standard for up to three children. Additional children beyond three are $2 each during the introductory month, then $5/month each ($50/year on annual billing)."
  },
  {
    question: "What if I change a workbook later?",
    answer: "The introductory month includes one initial plan for each paid student seat. After the first regular renewal, subscribers receive 5 plan updates each billing month. Replanning preserves work already started or completed and rebuilds only future weeks."
  },
  {
    question: "Does my child need to work on a screen?",
    answer: "No. Treeschool is designed so the parent manages the dashboard while the child can work from generated PDFs, physical books, and offline activities."
  },
  {
    question: "Can I cancel?",
    answer: "Yes. Manage or cancel the subscription from the billing page in your parent account. Cancellation stops future renewals. If a technical failure prevents Treeschool from producing a purchased plan, contact support so we can repair, rerun, or refund that charge."
  }
];

const planComparison = [
  { feature: "Student profiles", single: "1", standard: "Up to 3" },
  { feature: "Complete Treeschool K–4 core curriculum", single: "Included", standard: "Included" },
  { feature: "Printable weekly and daily lesson plans", single: "Included", standard: "Included" },
  { feature: "Academic curriculum evaluation", single: "Included", standard: "Included" },
  { feature: "Attendance, grades, progress, and reports", single: "Included", standard: "Included" },
  { feature: "Points, rewards, and learning streaks", single: "Included", standard: "Included" },
  { feature: "Teacher users", single: "Up to 2", standard: "Up to 4" },
  { feature: "More student profiles", single: "Upgrade to Standard", standard: "$5/month after 3" }
];

function CheckIcon() {
  return (
    <span aria-hidden="true" className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[#dceacd] text-sm font-black text-[#486338]">
      ✓
    </span>
  );
}

function formatError(error?: string) {
  if (!error) return null;
  return decodeURIComponent(error);
}

export default async function PricingPage(props: PricingPageProps) {
  const searchParams = await props.searchParams;
  const [currentUser, { dictionary }] = await Promise.all([
    getCurrentUser(),
    getRequestDictionary(searchParams?.lang)
  ]);
  const { home } = dictionary;
  const error = formatError(searchParams?.error);

  return (
    <main className="min-h-screen bg-[#f8f1e4] text-ink">
      <header className="border-b border-[#e7d8c1] bg-[#fffaf2]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-0">
            <Image src="/tree-icon.png" alt="Treeschool tree icon" width={96} height={96} className="h-16 w-16 object-contain" />
            <p className="brand-logo hidden text-[28px] font-semibold leading-none text-ink sm:block">{home.brand.name}</p>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/bookstore" className="hidden text-sm font-semibold text-ink/65 sm:inline-flex">Bookstore</Link>
            <Link href="#join" className="cta-button cta-button--light cta-button--small">
              Try for $6
            </Link>
            <Link href={currentUser ? "/p/dashboard" : "/p/signin"} className="hidden cta-button cta-button--dark cta-button--small sm:inline-flex">
              {currentUser ? "Dashboard" : "Parent sign in"}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[#cbd9bd] bg-[#e8f0e1]">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[48px] border-white/25" />
        <div className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[#d5e3ca]/70" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
          <div className="mx-auto max-w-4xl text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.12em] text-[#486338]">Elementary homeschool program · Grades K–4</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-ink sm:text-5xl lg:text-[56px]">
              Simple pricing for your whole homeschool.
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-ink/74 sm:text-[20px]">
              Single and Standard include the same complete Treeschool K–4 experience. Choose only the student capacity your homeschool needs.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {searchParams?.checkout === "canceled" ? (
          <div className="mx-auto mb-6 max-w-3xl rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-4 text-center text-sm font-semibold text-earth">
            Checkout was canceled. You can start your Treeschool membership whenever you are ready.
          </div>
        ) : null}
        {error ? (
          <div className="mx-auto mb-6 max-w-3xl rounded-[22px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-center text-sm font-semibold text-[#8b3e2f]">
            {error}
          </div>
        ) : null}

        <section id="join" className="mx-auto max-w-5xl scroll-mt-5">
          <h2 className="text-center text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">Choose your plan.</h2>
          <p className="mx-auto mb-7 mt-3 max-w-2xl text-center text-base leading-7 text-ink/62">
            Both plans include every Treeschool feature. Standard simply includes more students.
          </p>

          <MembershipPlanCards />

          <p className="mx-auto mt-5 max-w-3xl text-center text-sm leading-6 text-ink/58">
            Cancel anytime. You’ll create or sign in to your parent account before Stripe securely handles payment.
          </p>
        </section>

        <section className="mx-auto mt-14 max-w-5xl">
          <div className="overflow-hidden rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2]">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(82px,.6fr)_minmax(82px,.6fr)] items-center border-b border-[#eadbc2] bg-[#f2e6d3] px-4 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-ink">Compare plans</h2>
              <p className="text-center text-sm font-semibold text-ink">Single</p>
              <p className="text-center text-sm font-semibold text-ink">Standard</p>
            </div>
            {planComparison.map((row) => (
              <div key={row.feature} className="grid grid-cols-[minmax(0,1.4fr)_minmax(82px,.6fr)_minmax(82px,.6fr)] items-center border-b border-[#eadbc2] px-4 py-4 text-sm last:border-b-0 sm:px-6">
                <p className="pr-3 font-semibold leading-5 text-ink">{row.feature}</p>
                <p className="text-center leading-5 text-ink/68">{row.single}</p>
                <p className="text-center font-semibold leading-5 text-[#4d6a39]">{row.standard}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm leading-6 text-ink/58">No feature gates. Choose based only on how many children you are teaching.</p>
        </section>

        <section className="mx-auto mt-16 max-w-5xl">
          <div className="text-center">
            <p className="label-font text-sm font-black uppercase tracking-[0.14em] text-earth">Everything included</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">Plan, print, teach, and keep records.</h2>
          </div>

          <ul className="mt-8 overflow-hidden rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] divide-y divide-[#eadbc2]">
            {membershipFeatures.map((feature) => (
              <li key={feature.title} className="flex items-start gap-4 px-5 py-5 sm:px-7">
                <CheckIcon />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-ink">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-ink/66">{feature.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 rounded-[32px] bg-[#f2e6d3] px-6 py-9 sm:px-8 lg:px-10">
          <div className="max-w-2xl">
            <p className="label-font text-sm font-black uppercase tracking-[0.14em] text-earth">Questions before joining?</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-ink">The practical details.</h2>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {faqs.map((faq) => (
              <article key={faq.question} className="rounded-[22px] border border-[#dcc8aa] bg-[#fffaf2] px-5 py-5">
                <h3 className="text-lg font-semibold tracking-[-0.04em] text-ink">{faq.question}</h3>
                <p className="mt-3 text-sm leading-7 text-ink/70">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-16 text-center">
          <p className="label-font text-sm font-black uppercase tracking-[0.14em] text-earth">Your homeschool stays yours</p>
          <h2 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-ink sm:text-5xl">Keep your curriculum. Keep learning on paper. Lose the weekly scramble.</h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <form action={startPricingSubscriptionCheckoutAction} data-revenue-path="pricing-single-monthly-footer">
              <input type="hidden" name="interval" value="monthly" />
              <input type="hidden" name="planTier" value="single" />
              <input type="hidden" name="returnPath" value="/pricing" />
              <button type="submit" className="cta-button cta-button--dark">Try Single for $6</button>
            </form>
            <form action={startPricingSubscriptionCheckoutAction} data-revenue-path="pricing-standard-monthly-footer">
              <input type="hidden" name="interval" value="monthly" />
              <input type="hidden" name="planTier" value="standard" />
              <input type="hidden" name="returnPath" value="/pricing" />
              <button type="submit" className="cta-button cta-button--light">Try Standard for $6</button>
            </form>
          </div>
          <p className="mt-4 text-sm leading-6 text-ink/62">The $6 price is an introductory discount for your first month. Then $14/month for Single or $20/month for Standard. Cancel anytime.</p>
        </section>
      </div>
    </main>
  );
}
