import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { startCoreSubscriptionCheckoutAction } from "../billing-actions";
import { getRequestDictionary } from "../../lib/i18n/server";

export const metadata: Metadata = {
  title: "Elementary Homeschool Program Pricing for Grades K–4 | Treeschool",
  description: "See Treeschool pricing for a paper-first elementary homeschooling program for grades K–4, with printable lesson plans, curriculum tools, attendance, progress, and optional grades."
};

type PricingPageProps = {
  searchParams?: {
    lang?: string;
    checkout?: string;
    error?: string;
    message?: string;
  };
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
    title: "Up to three children",
    copy: "Keep each child’s plans, profile, progress, attendance, and grades organized from one parent account."
  },
  {
    title: "Up to four Teacher users",
    copy: "Invite other parents, tutors, or teachers to help teach, record attendance, add grades, and mark lessons done—without giving them permission to delete your family’s data."
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
    answer: "Yes. Treeschool includes up to three children. Additional children are $2 each during the introductory month, then $5/month each ($50/year on annual billing)."
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

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const { dictionary } = await getRequestDictionary(searchParams?.lang);
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
            <Link href="/p/signin" className="hidden cta-button cta-button--dark cta-button--small sm:inline-flex">
              Parent sign in
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
              One membership includes the complete Treeschool K–4 experience for up to three children and four Teacher users. Choose monthly or annual billing—nothing else to compare.
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
        {searchParams?.message ? (
          <div className="mx-auto mb-6 max-w-3xl rounded-[22px] border border-[#b8cf9f] bg-[#eef5e4] px-5 py-4 text-center text-sm font-semibold text-[#4d6a39]">
            {searchParams.message}
          </div>
        ) : null}
        {error ? (
          <div className="mx-auto mb-6 max-w-3xl rounded-[22px] border border-[#d9afa2] bg-[#fff1ec] px-5 py-4 text-center text-sm font-semibold text-[#8b3e2f]">
            {error}
          </div>
        ) : null}

        <section id="join" className="mx-auto max-w-5xl scroll-mt-5">
          <h2 className="sr-only">Choose monthly or annual billing</h2>
          <p className="mb-5 text-center text-sm font-semibold text-ink/58">The same membership and features—choose monthly flexibility or save with annual billing.</p>

          <div className="grid gap-5 md:grid-cols-2">
            <form action={startCoreSubscriptionCheckoutAction} className="flex flex-col rounded-[28px] border border-[#dcc8aa] bg-[#fffaf2] p-6 shadow-[0_12px_30px_rgba(68,49,36,0.08)] sm:p-8">
              <input type="hidden" name="interval" value="monthly" />
              <input type="hidden" name="returnPath" value="/pricing" />
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold text-ink">Monthly</h3>
                <span className="rounded-full bg-[#dceacd] px-3 py-1 text-xs font-semibold text-[#486338]">Start for $6</span>
              </div>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-[56px] font-semibold leading-none tracking-[-0.06em] text-ink">$6</span>
                <span className="pb-1.5 text-sm font-semibold text-ink/55">first month</span>
              </div>
              <p className="mt-3 text-base font-semibold text-[#486338]">Then $20/month · Up to 3 children · 4 Teacher users</p>
              <p className="mt-3 text-sm leading-6 text-ink/62">Includes one initial lesson plan per child. Additional children are $2 each initially, then $5/month each.</p>
              <button type="submit" className="cta-button cta-button--dark mt-7 w-full">Try Treeschool for $6</button>
            </form>

            <form action={startCoreSubscriptionCheckoutAction} className="flex flex-col rounded-[28px] border-2 border-[#8baa70] bg-[#eef5e4] p-6 shadow-[0_12px_30px_rgba(68,49,36,0.08)] sm:p-8">
              <input type="hidden" name="interval" value="yearly" />
              <input type="hidden" name="returnPath" value="/pricing" />
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold text-ink">Annual</h3>
                <span className="rounded-full bg-[#5f823f] px-3 py-1 text-xs font-semibold text-white">Save 17%</span>
              </div>
              <div className="mt-6 flex items-end gap-2">
                <span className="text-[56px] font-semibold leading-none tracking-[-0.06em] text-ink">$200</span>
                <span className="pb-1.5 text-sm font-semibold text-ink/55">per year</span>
              </div>
              <p className="mt-3 text-base font-semibold text-[#486338]">About $16.67/month · Up to 3 children · 4 Teacher users</p>
              <p className="mt-3 text-sm leading-6 text-ink/62">Billed once per year. Additional children are $50/year each.</p>
              <button type="submit" className="cta-button cta-button--light mt-7 w-full">Choose annual billing</button>
            </form>
          </div>

          <p className="mx-auto mt-5 max-w-3xl text-center text-sm leading-6 text-ink/58">
            Cancel anytime. You’ll create or sign in to your parent account before Stripe securely handles payment.
          </p>
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
            <form action={startCoreSubscriptionCheckoutAction}>
              <input type="hidden" name="interval" value="monthly" />
              <input type="hidden" name="returnPath" value="/pricing" />
              <button type="submit" className="cta-button cta-button--dark">Try Treeschool for $6</button>
            </form>
            <form action={startCoreSubscriptionCheckoutAction}>
              <input type="hidden" name="interval" value="yearly" />
              <input type="hidden" name="returnPath" value="/pricing" />
              <button type="submit" className="cta-button cta-button--light">Choose annual · Save 17%</button>
            </form>
          </div>
          <p className="mt-4 text-sm leading-6 text-ink/62">First month $6, then $20/month for up to three children. Additional children are $5/month each.</p>
        </section>
      </div>
    </main>
  );
}
