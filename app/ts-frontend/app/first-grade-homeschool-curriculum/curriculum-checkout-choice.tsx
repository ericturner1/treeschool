"use client";

import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { startFunnelOrderCheckoutAction } from "../bookstore/actions";

type ChoiceProps = {
  bundleSlug: string;
  bundlePrice: string;
  bundlePriceInCents: number;
  currencyCode: string;
  userEmail: string | null;
  triggerLabel: string;
  triggerStyle?: "green" | "dark";
  returnPath?: string;
  landingVariant?: "a" | "b" | null;
  funnelVisitorId?: string | null;
  previewMode?: boolean;
  successPath?: string;
};

type OptionsProps = Omit<ChoiceProps, "triggerLabel" | "triggerStyle"> & {
  bundleId: string;
  bundleTitle: string;
  bundleDescription: string;
  submitLabel: string;
  primaryProductKind?: "bookstore" | "subscription";
  primaryBillingNote?: string;
  funnelKey?: string;
  orderBumps: Array<{
    id: string;
    title: string;
    description: string;
    priceInCents: number;
    currencyCode: string;
  }>;
};

function purchaseChoiceHref({
  returnPath,
  landingVariant,
  funnelVisitorId,
  previewMode
}: Pick<ChoiceProps, "returnPath" | "landingVariant" | "funnelVisitorId" | "previewMode">) {
  const query = new URLSearchParams();
  if (returnPath) query.set("return", returnPath);
  if (landingVariant) query.set("landingVariant", landingVariant);
  if (funnelVisitorId) query.set("visitor", funnelVisitorId);
  if (previewMode) query.set("preview", "1");
  const suffix = query.toString();
  return `/first-grade-curriculum/choose${suffix ? `?${suffix}` : ""}`;
}

export function CurriculumCheckoutChoice({
  triggerLabel,
  triggerStyle = "dark",
  returnPath,
  landingVariant = null,
  funnelVisitorId = null,
  previewMode = false
}: ChoiceProps) {
  return (
    <Link
      href={purchaseChoiceHref({
        returnPath,
        landingVariant,
        funnelVisitorId,
        previewMode
      }) as Route}
      className={`cta-button w-full justify-center ${
        triggerStyle === "green" ? "cta-button--light" : "cta-button--dark"
      }`}
      data-funnel-cta="open-checkout-choice"
    >
      {triggerLabel}
    </Link>
  );
}

export function CurriculumCheckoutOptions({
  bundleId,
  bundleSlug,
  bundleTitle,
  bundleDescription,
  bundlePrice,
  bundlePriceInCents,
  currencyCode,
  orderBumps,
  submitLabel,
  primaryProductKind = "bookstore",
  primaryBillingNote = "One time",
  funnelKey = "first_grade_curriculum",
  userEmail,
  returnPath = "/first-grade-curriculum/choose",
  landingVariant = null,
  funnelVisitorId = null,
  previewMode = false,
  successPath
}: OptionsProps) {
  const [selectedBumpIds, setSelectedBumpIds] = useState<string[]>([]);
  const money = (cents: number, currency: string) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(cents / 100);
  const totalInCents = bundlePriceInCents + orderBumps.reduce(
    (total, item) => selectedBumpIds.includes(item.id) ? total + item.priceInCents : total,
    0
  );

  return (
    <form
      action={startFunnelOrderCheckoutAction}
      className="grid gap-5"
      data-funnel-cta="start-order-form-checkout"
      data-revenue-path="first-grade-curriculum-order-form"
    >
      <input type="hidden" name="primaryProductId" value={bundleId} />
      {primaryProductKind === "bookstore" ? <input type="hidden" name="workbookId" value={bundleId} /> : null}
      <input type="hidden" name="bundleSlug" value={bundleSlug} />
      <input type="hidden" name="funnelKey" value={funnelKey} />
      <input type="hidden" name="returnPath" value={returnPath} />
      {successPath ? <input type="hidden" name="successPath" value={successPath} /> : null}
      {landingVariant ? <input type="hidden" name="landingVariant" value={landingVariant} /> : null}
      {funnelVisitorId ? <input type="hidden" name="funnelVisitorId" value={funnelVisitorId} /> : null}
      {previewMode ? <input type="hidden" name="experimentPreview" value="true" /> : null}

      <article className="rounded-[24px] border-2 border-[#7ca05d] bg-[#edf5e5] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full bg-[#6f984e] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-white">Included in order</span>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{bundleTitle}</h2>
            <p className="mt-2 leading-7 text-ink/68">{bundleDescription}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tracking-[-0.04em]">{bundlePrice}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink/50">{primaryBillingNote}</p>
          </div>
        </div>
      </article>

      {orderBumps.length ? (
        <section className="rounded-[24px] border border-[#d8c7ad] bg-[#fffdf8] p-5 sm:p-6">
          <p className="label-font text-sm font-black uppercase tracking-[0.09em] text-earth">Optional additions</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Add more to this order</h2>
          <div className="mt-4 grid gap-3">
            {orderBumps.map((item) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-4 rounded-[18px] border border-[#decdb3] bg-[#f8f2e8] p-4 transition hover:border-[#88a76e] hover:bg-[#f0f6e9]">
                <input
                  type="checkbox"
                  name="workbookId"
                  value={item.id}
                  checked={selectedBumpIds.includes(item.id)}
                  onChange={(event) => setSelectedBumpIds((current) => event.target.checked
                    ? [...current, item.id]
                    : current.filter((id) => id !== item.id))}
                  className="mt-1 h-6 w-6 shrink-0 accent-[#6f984e]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{item.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-ink/60">{item.description}</span>
                </span>
                <span className="shrink-0 font-semibold">+{money(item.priceInCents, item.currencyCode)}</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[24px] border border-[#d8c7ad] bg-[#f8f2e8] p-5 sm:p-6">
        <div className="grid gap-3">
          {userEmail ? (
            <>
              <input type="hidden" name="email" value={userEmail} />
              <p className="text-sm text-ink/58">Delivery email <strong className="text-ink">{userEmail}</strong></p>
            </>
          ) : (
            <label className="grid gap-2 text-sm font-semibold">
              Delivery email
              <input required name="email" type="email" autoComplete="email" placeholder="you@example.com" className="rounded-[14px] border border-[#dcc8aa] bg-white px-4 py-3" />
            </label>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-[#decdb3] pt-4">
            <span className="font-semibold">{primaryProductKind === "subscription" ? "Starting total" : "Order total"}</span>
            <span className="text-2xl font-semibold">{money(totalInCents, currencyCode)}</span>
          </div>
          <button type="submit" className="cta-button cta-button--light w-full justify-center">
            {submitLabel}
          </button>
          <p className="text-center text-xs leading-5 text-ink/50">
            {primaryProductKind === "subscription"
              ? "Stripe will show the recurring price, any introductory offer you qualify for, and one-time additions before you subscribe."
              : "You will review this order once more on Stripe before you pay."}
          </p>
        </div>
      </section>
    </form>
  );
}
