"use client";

import { useState } from "react";
import { startPricingSubscriptionCheckoutAction } from "../billing-actions";

type MembershipPlanCardProps = {
  tier: "single" | "standard";
  name: string;
  audience: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  interval: "monthly" | "yearly";
  recommended?: boolean;
};

function MembershipPlanCard({
  tier,
  name,
  audience,
  monthlyPrice,
  annualPrice,
  description,
  interval,
  recommended = false
}: MembershipPlanCardProps) {
  const isMonthly = interval === "monthly";
  const annualMonthlyEquivalent = (annualPrice / 12).toFixed(2);

  return (
    <article
      data-plan-card={tier}
      className={`relative flex flex-col rounded-[28px] p-6 shadow-[0_12px_30px_rgba(68,49,36,0.08)] sm:p-8 ${
        recommended
          ? "border-2 border-[#759b57] bg-[#eef5e4] shadow-[0_16px_38px_rgba(83,112,58,0.16)]"
          : "border border-[#dcc8aa] bg-[#fffaf2]"
      }`}
    >
      {recommended ? (
        <span className="absolute right-5 top-0 -translate-y-1/2 rounded-full bg-[#5f823f] px-4 py-1.5 text-xs font-bold tracking-[0.02em] text-white shadow-sm sm:right-7">
          Best Value
        </span>
      ) : null}

      <div>
        <div>
          <h3 className="text-3xl font-semibold tracking-[-0.04em] text-ink">{name}</h3>
          <p className="mt-1 text-sm font-semibold text-ink/55">{audience}</p>
        </div>
      </div>

      <div className="mt-6 flex items-end gap-2">
        <span className="text-[56px] font-semibold leading-none tracking-[-0.06em] text-ink">
          ${isMonthly ? monthlyPrice : annualPrice}
        </span>
        <span className="pb-1.5 text-sm font-semibold text-ink/55">
          per {isMonthly ? "month" : "year"}
        </span>
      </div>
      <p className="mt-3 min-h-[48px] text-sm leading-6 text-ink/62">
        {isMonthly
          ? `First month $6. ${description}`
          : `$${annualMonthlyEquivalent}/month when billed annually. ${description}`}
      </p>

      <form
        action={startPricingSubscriptionCheckoutAction}
        data-revenue-path={`pricing-${tier}-${interval}`}
        className="mt-7"
      >
        <input type="hidden" name="interval" value={interval} />
        <input type="hidden" name="planTier" value={tier} />
        <input type="hidden" name="returnPath" value="/pricing" />
        <button
          type="submit"
          className={`cta-button w-full ${
            recommended ? "cta-button--light" : "cta-button--outline"
          }`}
        >
          {isMonthly
            ? `Try ${name} for $6`
            : `Choose ${name} annual plan`}
        </button>
      </form>
      <p className="mt-3 text-center text-xs font-semibold leading-5 text-ink/55">
        {isMonthly
          ? `Introductory first-month discount. Then $${monthlyPrice}/month. Cancel anytime.`
          : `Billed yearly at $${annualPrice}. Cancel anytime.`}
      </p>
    </article>
  );
}

export function MembershipPlanCards() {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");

  return (
    <>
      <div
        role="group"
        aria-label="Billing interval"
        className="mx-auto mb-7 grid w-full max-w-[390px] grid-cols-2 rounded-full bg-[#eadfce] p-1.5"
      >
        <button
          type="button"
          aria-pressed={interval === "monthly"}
          onClick={() => setInterval("monthly")}
          className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            interval === "monthly"
              ? "bg-white text-ink shadow-sm"
              : "text-ink/58 hover:text-ink"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          aria-pressed={interval === "yearly"}
          onClick={() => setInterval("yearly")}
          className={`rounded-full px-4 py-2.5 text-sm font-semibold transition ${
            interval === "yearly"
              ? "bg-white text-ink shadow-sm"
              : "text-ink/58 hover:text-ink"
          }`}
        >
          Annual <span className="text-[#4d6a39]">· save 17%</span>
        </button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <MembershipPlanCard
          tier="single"
          name="Single"
          audience="For one student · up to two Teacher users"
          monthlyPrice={14}
          annualPrice={140}
          description="One student profile with every Treeschool planning, teaching, and recordkeeping feature."
          interval={interval}
        />
        <MembershipPlanCard
          tier="standard"
          name="Standard"
          audience="For up to three students · up to four Teacher users"
          monthlyPrice={20}
          annualPrice={200}
          description="Up to three separate student profiles with the same complete feature set."
          interval={interval}
          recommended
        />
      </div>
    </>
  );
}
