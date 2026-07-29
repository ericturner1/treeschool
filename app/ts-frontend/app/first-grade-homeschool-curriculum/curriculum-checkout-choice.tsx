"use client";

import { useEffect, useId, useState } from "react";
import { startPricingSubscriptionCheckoutAction } from "../billing-actions";
import { startWorkbookCheckoutAction } from "../bookstore/actions";

type Props = {
  bundleSlug: string;
  bundlePrice: string;
  bundlePriceInCents: number;
  currencyCode: string;
  userEmail: string | null;
  triggerLabel: string;
  triggerStyle?: "green" | "dark";
};

export function CurriculumCheckoutChoice({
  bundleSlug,
  bundlePrice,
  bundlePriceInCents,
  currencyCode,
  userEmail,
  triggerLabel,
  triggerStyle = "dark"
}: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`cta-button w-full justify-center ${
          triggerStyle === "green" ? "cta-button--light" : "cta-button--dark"
        }`}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-[#172033]/58 px-4 py-6 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative my-auto w-full max-w-4xl rounded-[30px] border border-[#d8c7ad] bg-[#fffaf2] p-5 shadow-[0_26px_80px_rgba(23,32,51,.28)] sm:p-8"
          >
            <button
              type="button"
              aria-label="Close checkout choices"
              className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white text-2xl text-ink/58 shadow-sm transition hover:text-ink"
              onClick={() => setOpen(false)}
            >
              ×
            </button>

            <div className="pr-12">
              <p className="label-font text-sm font-black uppercase tracking-[0.1em] text-earth">
                One quick choice
              </p>
              <h2
                id={titleId}
                className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl"
              >
                Would you like Treeschool to organize the year too?
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-ink/66 sm:text-lg">
                The membership includes this core curriculum inside the planner. Or buy the printable PDF collection once and organize it yourself.
              </p>
            </div>

            <div className="mt-7 grid gap-4 lg:grid-cols-[1.08fr_.92fr]">
              <article className="relative rounded-[24px] border-2 border-[#7ca05d] bg-[#edf5e5] p-5 sm:p-6">
                <span className="inline-flex rounded-full bg-[#6f984e] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-white">
                  Recommended
                </span>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">
                  Curriculum + planning
                </h3>
                <p className="mt-2 leading-7 text-ink/68">
                  Get the first-grade core curriculum, printable weekly plans, attendance, grades, progress, points, and streaks.
                </p>
                <p className="mt-5 text-3xl font-semibold tracking-[-0.04em]">$6 today</p>
                <p className="mt-1 text-sm font-semibold text-ink/55">
                  Introductory first month, then Single is $14/month. Cancel anytime.
                </p>
                <form
                  action={startPricingSubscriptionCheckoutAction}
                  className="mt-5"
                  data-revenue-path="first-grade-curriculum-membership-bump"
                  data-analytics-item-id="treeschool-single-membership"
                  data-analytics-item-name="Treeschool Single membership"
                  data-analytics-item-category="membership"
                  data-analytics-currency="USD"
                  data-analytics-value="6"
                >
                  <input type="hidden" name="interval" value="monthly" />
                  <input type="hidden" name="planTier" value="single" />
                  <input type="hidden" name="returnPath" value="/first-grade-homeschool-curriculum" />
                  <input type="hidden" name="funnelKey" value="first_grade_curriculum" />
                  <button type="submit" className="cta-button cta-button--light w-full justify-center">
                    Start Treeschool for $6
                  </button>
                </form>
              </article>

              <article className="rounded-[24px] border border-[#d8c7ad] bg-[#f8f2e8] p-5 sm:p-6">
                <p className="label-font text-sm font-black uppercase tracking-[0.09em] text-earth">
                  No subscription
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">
                  Printable curriculum only
                </h3>
                <p className="mt-2 leading-7 text-ink/68">
                  Own every PDF workbook and organize the teaching year yourself.
                </p>
                <p className="mt-5 text-3xl font-semibold tracking-[-0.04em]">{bundlePrice}</p>
                <p className="mt-1 text-sm font-semibold text-ink/55">
                  One-time purchase. The files remain yours to keep.
                </p>
                <form
                  action={startWorkbookCheckoutAction}
                  className="mt-5 grid gap-3"
                  data-revenue-path="first-grade-curriculum-bundle-after-bump"
                  data-analytics-item-id={bundleSlug}
                  data-analytics-item-name="First-grade curriculum bundle"
                  data-analytics-item-category="bundle"
                  data-analytics-currency={currencyCode}
                  data-analytics-value={(bundlePriceInCents / 100).toFixed(2)}
                >
                  <input type="hidden" name="slug" value={bundleSlug} />
                  <input type="hidden" name="funnelKey" value="first_grade_curriculum" />
                  {userEmail ? (
                    <input type="hidden" name="email" value={userEmail} />
                  ) : (
                    <label className="grid gap-2 text-sm font-semibold">
                      Delivery email
                      <input
                        required
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3"
                      />
                    </label>
                  )}
                  <button type="submit" className="cta-button cta-button--outline w-full justify-center">
                    Buy once · {bundlePrice}
                  </button>
                </form>
              </article>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-ink/48">
              Both checkouts are securely handled by Stripe. No Japanese elective is added unless you explicitly accept the separate offer after checkout.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}
