"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { FirstGradePostCheckoutOffer } from "../../../lib/billing/server";
import { trackAnalyticsEvent } from "../../../lib/analytics/events";

type Mode = "full" | "starter";

function formatPrice(priceInCents: number, currencyCode: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2
  }).format(priceInCents / 100);
}

export function FirstGradeJapaneseOfferExperience({
  data,
  previewMode = false,
  showPreviewNotice = true,
  initialMode: initialModeOverride,
  previewDownsellPath
}: {
  data: FirstGradePostCheckoutOffer;
  previewMode?: boolean;
  showPreviewNotice?: boolean;
  initialMode?: Mode;
  previewDownsellPath?: string;
}) {
  const initialMode: Mode = initialModeOverride ?? (
    data.state === "downsell_shown" ||
    (data.state === "checkout_required" && data.selectedVariant === "starter")
      ? "starter"
      : "full"
  );
  const [mode, setMode] = useState<Mode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewComplete, setPreviewComplete] = useState(false);
  const [selectedImageKey, setSelectedImageKey] = useState("bundle");
  const selectedOffer = mode === "starter" ? data.offer.starter : data.offer.full;
  const formattedPrice = useMemo(
    () => selectedOffer
      ? formatPrice(selectedOffer.priceInCents, selectedOffer.currencyCode)
      : "",
    [selectedOffer]
  );
  const galleryImages = useMemo(() => {
    if (!selectedOffer) return [];
    return [
      ...(mode === "full" && selectedOffer.thumbnailUrl
        ? [{
            key: "bundle",
            title: selectedOffer.title,
            thumbnailUrl: selectedOffer.thumbnailUrl,
            kind: "bundle" as const
          }]
        : []),
      ...selectedOffer.items.map((item) => ({
        key: item.id,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        kind: "workbook" as const
      }))
    ];
  }, [mode, selectedOffer]);
  const selectedImage =
    galleryImages.find((image) => image.key === selectedImageKey) ??
    galleryImages[0] ??
    null;

  useEffect(() => {
    if (previewMode || !selectedOffer) return;
    trackAnalyticsEvent("view_promotion", {
      creative_name: mode === "full" ? "Japanese bundle upsell" : "Japanese starter downsell",
      promotion_id: selectedOffer.key,
      promotion_name: selectedOffer.title,
      currency: selectedOffer.currencyCode,
      value: selectedOffer.priceInCents / 100,
      items: [{
        item_id: selectedOffer.key,
        item_name: selectedOffer.title,
        item_category: mode === "full" ? "upsell" : "downsell",
        price: selectedOffer.priceInCents / 100,
        quantity: 1
      }]
    });
  }, [mode, previewMode, selectedOffer]);

  async function decide(action: "accept_full" | "decline_full" | "accept_starter" | "decline_starter") {
    setError("");
    if (!selectedOffer) return;
    if (previewMode) {
      if (action === "decline_full" && data.offer.starter) {
        if (previewDownsellPath) {
          window.location.assign(previewDownsellPath);
          return;
        }
        setMode("starter");
      } else {
        setPreviewComplete(true);
      }
      return;
    }

    setBusy(true);
    if (action === "accept_full" || action === "accept_starter") {
      trackAnalyticsEvent("select_promotion", {
        creative_name: mode === "full" ? "Japanese bundle upsell" : "Japanese starter downsell",
        promotion_id: selectedOffer.key,
        promotion_name: selectedOffer.title,
        currency: selectedOffer.currencyCode,
        value: selectedOffer.priceInCents / 100,
        items: [{
          item_id: selectedOffer.key,
          item_name: selectedOffer.title,
          item_category: mode === "full" ? "upsell" : "downsell",
          price: selectedOffer.priceInCents / 100,
          quantity: 1
        }]
      });
    }
    try {
      const response = await fetch("/api/post-checkout-offers/first-grade-japanese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCheckoutSessionId: data.sourceCheckoutSessionId,
          action
        })
      });
      const payload = await response.json().catch(() => null) as {
        status?: "complete" | "downsell" | "redirect";
        thankYouPath?: string;
        url?: string | null;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not update the offer.");
      if (payload?.status === "downsell") {
        window.location.assign(
          `/offers/ds/first-grade-japanese?session_id=${encodeURIComponent(data.sourceCheckoutSessionId)}`
        );
        return;
      }
      if (payload?.status === "redirect" && payload.url) {
        window.location.assign(payload.url);
        return;
      }
      if (payload?.status === "complete" && payload.thankYouPath) {
        window.location.assign(payload.thankYouPath);
        return;
      }
      throw new Error("The offer response was incomplete.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the offer.");
      setBusy(false);
    }
  }

  if (!selectedOffer) return null;

  if (previewComplete) {
    return (
      <div className="rounded-[26px] border border-[#b8cba7] bg-[#edf5e5] p-7 text-center">
        <p className="text-2xl font-semibold">Preview complete</p>
        <p className="mt-2 text-ink/65">No payment was made and no workbook was added.</p>
        <button
          type="button"
          className="cta-button cta-button--outline mt-5"
          onClick={() => {
            setMode(initialMode);
            setPreviewComplete(false);
          }}
        >
          Restart preview
        </button>
      </div>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[54rem]">
      {previewMode && showPreviewNotice ? (
        <div className="mb-5 rounded-[18px] border border-[#d7b66a] bg-[#fff4cf] px-5 py-4 text-sm font-semibold text-[#6e5522]">
          Admin preview mode—these buttons simulate the flow and can never charge a card.
        </div>
      ) : null}

      <header className="mx-auto mb-5 max-w-4xl text-center">
        <p className="label-font text-xs font-black uppercase tracking-[0.12em] text-earth">
          {mode === "full" ? "A one-time addition" : "A smaller way to begin"}
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold leading-[1.04] tracking-[-0.05em] sm:text-4xl">
          {mode === "full"
            ? `Add “${selectedOffer.title}” to your order?`
            : `Start with just “${selectedOffer.title}”?`}
        </h1>
      </header>

      <div className="rounded-[28px] border border-[#b8cba7] bg-[#fffaf2] p-5 shadow-[0_18px_44px_rgba(72,99,56,.11)] sm:p-7">
        <div className="grid items-center gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-9">
          <div className="mx-auto w-full max-w-[220px] lg:max-w-[250px]">
            <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-[18px] border border-[#c7d8b8] bg-[#edf5e5] shadow-[0_10px_24px_rgba(72,99,56,.13)]">
              {selectedImage?.thumbnailUrl ? (
                <Image
                  src={selectedImage.thumbnailUrl}
                  alt={`${selectedImage.title} cover`}
                  fill
                  unoptimized
                  className="object-contain p-1.5"
                  priority
                />
              ) : (
                <span className="grid h-full place-items-center text-6xl" aria-hidden="true">📘</span>
              )}
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-ink/55">
              {selectedImage?.title}
            </p>

            {galleryImages.length > 1 ? (
              <div className="mt-2.5 flex justify-center gap-2" aria-label="Choose a workbook cover to preview">
                {galleryImages.map((image) => {
                  const selected = selectedImage?.key === image.key;
                  const isBundle = image.kind === "bundle";
                  return (
                    <button
                      key={image.key}
                      type="button"
                      onClick={() => setSelectedImageKey(image.key)}
                      aria-label={`Preview ${image.title}`}
                      aria-pressed={selected}
                      className={`relative h-12 overflow-hidden rounded-[6px] bg-[#f3ede3] transition ${isBundle ? "aspect-square" : "aspect-[.76]"} ${
                        selected
                          ? "border-2 border-[#6f914f] shadow-[0_3px_0_#4f7839]"
                          : "border border-[#ddcdb6] opacity-75 hover:opacity-100"
                      }`}
                    >
                      {image.thumbnailUrl ? (
                        <Image
                          src={image.thumbnailUrl}
                          alt=""
                          fill
                          unoptimized
                          className={isBundle ? "object-contain p-0.5" : "object-cover"}
                        />
                      ) : (
                        <span className="grid h-full place-items-center text-lg" aria-hidden="true">📘</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="min-w-0">
            <p className="mx-auto max-w-2xl text-center text-lg leading-8 text-ink/68 lg:mx-0 lg:text-left">
              {mode === "full"
                ? `“${selectedOffer.title}” is a bundle of ${selectedOffer.items.length} printable PDF workbooks that guide your child through a beginner Japanese sequence.`
                : `“${selectedOffer.title}” is a printable PDF workbook that introduces your child to beginner Japanese.`}{" "}
              It will be added to your current order as a separate one-time purchase, with no subscription or recurring charge. Secure PDF download links will be emailed to you after purchase, and the workbooks will remain available in Purchased Workbooks in your account.
            </p>

            {error ? (
              <p role="alert" className="mt-3 rounded-[12px] bg-[#fff0eb] px-3 py-2 text-sm font-semibold text-[#9b4030]">
                {error}
              </p>
            ) : null}
            {!previewMode ? (
              <p className="mt-3 text-[11px] leading-4 text-ink/52">
                By accepting, you authorize a one-time {formattedPrice} charge to the payment method used at checkout.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#e4d6c1] pt-5">
          <button
            type="button"
            disabled={busy}
            className="cta-button cta-button--light justify-center disabled:cursor-wait disabled:opacity-65"
            onClick={() => decide(mode === "full" ? "accept_full" : "accept_starter")}
          >
            {busy ? "Please wait…" : `Yes—add for ${formattedPrice}`}
          </button>
          <button
            type="button"
            disabled={busy}
            className="cta-button cta-button--outline justify-center disabled:opacity-55"
            onClick={() => decide(mode === "full" ? "decline_full" : "decline_starter")}
          >
            No thanks—continue
          </button>
        </div>
      </div>
    </section>
  );
}
