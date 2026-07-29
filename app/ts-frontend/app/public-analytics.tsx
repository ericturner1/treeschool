"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  flushQueuedAnalyticsEvents,
  trackAnalyticsEvent
} from "../lib/analytics/events";
import {
  requiresPriorAnalyticsConsent,
  shouldEnablePublicAnalytics
} from "../lib/analytics/public-routes";

const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-CNXCLD3PLH";
const META_PIXEL_ID = "930584153407646";
const ANALYTICS_CONSENT_STORAGE_KEY = "treeschool:analytics-consent:v1";

type AnalyticsConsent = "granted" | "denied" | "unknown";

function sanitizedReferrer() {
  if (!document.referrer) return "";

  try {
    const referrer = new URL(document.referrer);
    return `${referrer.origin}${referrer.pathname}`;
  } catch {
    return "";
  }
}

function analyticsDisableKey() {
  return `ga-disable-${GOOGLE_ANALYTICS_MEASUREMENT_ID}`;
}

function setAnalyticsDisabled(disabled: boolean) {
  (window as unknown as Record<string, unknown>)[analyticsDisableKey()] = disabled;
}

function configureGoogleAnalytics() {
  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };

  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ANALYTICS_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  if (!document.querySelector(`script[data-treeschool-analytics="${GOOGLE_ANALYTICS_MEASUREMENT_ID}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GOOGLE_ANALYTICS_MEASUREMENT_ID
    )}`;
    script.dataset.treeschoolAnalytics = GOOGLE_ANALYTICS_MEASUREMENT_ID;
    document.head.appendChild(script);
  }

}

function configureMetaPixel() {
  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
        return;
      }
      fbq.queue?.push(args);
    }) as NonNullable<Window["fbq"]>;

    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }

  window.fbq("init", META_PIXEL_ID);

  if (!document.querySelector(`script[data-treeschool-meta-pixel="${META_PIXEL_ID}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.treeschoolMetaPixel = META_PIXEL_ID;
    document.head.appendChild(script);
  }
}

function membershipCheckoutValue(form: HTMLFormElement) {
  const data = new FormData(form);
  const interval = String(data.get("interval") ?? "");
  const tier = String(data.get("planTier") ?? "");

  if (interval === "monthly") return 6;
  if (interval === "yearly" && tier === "single") return 140;
  if (interval === "yearly" && tier === "standard") return 200;
  return undefined;
}

export function PublicAnalytics({
  countryCode
}: {
  countryCode: string | null;
}) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<AnalyticsConsent>("unknown");
  const [eligible, setEligible] = useState(false);
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    const nextEligible = shouldEnablePublicAnalytics(
      pathname,
      window.location.hostname
    );
    setEligible(nextEligible);
    window.treeschoolAnalyticsCanQueue = nextEligible;

    if (!nextEligible) {
      setAnalyticsDisabled(true);
      window.treeschoolAnalyticsQueue = [];
      return;
    }

    const stored = window.localStorage.getItem(
      ANALYTICS_CONSENT_STORAGE_KEY
    );
    if (stored === "granted" || stored === "denied") {
      setConsent(stored);
      return;
    }

    setConsent(
      requiresPriorAnalyticsConsent(countryCode) ? "unknown" : "granted"
    );
  }, [countryCode, pathname]);

  useEffect(() => {
    if (!eligible || consent !== "granted") return;

    setAnalyticsDisabled(false);
    configureGoogleAnalytics();
    configureMetaPixel();
    flushQueuedAnalyticsEvents();
    if (lastTrackedPath.current === pathname) return;

    trackAnalyticsEvent("page_view", {
      event_id: window.crypto.randomUUID(),
      page_location: `${window.location.origin}${pathname}`,
      page_path: pathname,
      page_title: document.title,
      page_referrer: sanitizedReferrer()
    });
    lastTrackedPath.current = pathname;
  }, [consent, eligible, pathname]);

  useEffect(() => {
    if (!eligible) return;

    const trackCheckout = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const revenuePath = form.dataset.revenuePath;
      if (!revenuePath) return;

      const formData = new FormData(form);
      const itemId =
        form.dataset.analyticsItemId ||
        String(formData.get("planTier") ?? revenuePath);
      const itemName =
        form.dataset.analyticsItemName ||
        String(formData.get("planTier") ?? "Treeschool checkout");
      const explicitValue = Number(form.dataset.analyticsValue);
      const value = Number.isFinite(explicitValue)
        ? explicitValue
        : membershipCheckoutValue(form);

      trackAnalyticsEvent("begin_checkout", {
        currency: form.dataset.analyticsCurrency || "USD",
        event_id: window.crypto.randomUUID(),
        value,
        checkout_path: revenuePath,
        items: [
          {
            item_id: itemId,
            item_name: itemName,
            item_category:
              form.dataset.analyticsItemCategory || "membership"
          }
        ]
      });
    };

    document.addEventListener("submit", trackCheckout);
    return () => document.removeEventListener("submit", trackCheckout);
  }, [eligible]);

  function chooseConsent(nextConsent: Exclude<AnalyticsConsent, "unknown">) {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, nextConsent);
    setConsent(nextConsent);
    if (nextConsent === "denied") {
      window.treeschoolAnalyticsQueue = [];
      setAnalyticsDisabled(true);
    }
  }

  if (!eligible || consent !== "unknown") return null;

  return (
    <aside
      aria-label="Analytics choice"
      className="fixed inset-x-3 bottom-3 z-[200] mx-auto max-w-3xl rounded-[22px] border border-[#cdb995] bg-[#fffaf2] p-4 text-ink shadow-[0_18px_55px_rgba(48,36,27,.24)] sm:inset-x-5 sm:flex sm:items-center sm:gap-5 sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Help us improve Treeschool?</p>
        <p className="mt-1 text-sm leading-6 text-ink/65">
          Allow privacy-conscious analytics and advertising measurement on
          public pages. We do not send student, account, email, or curriculum
          information.{" "}
          <Link href="/privacy" className="font-semibold underline underline-offset-4">
            Privacy details
          </Link>
        </p>
      </div>
      <div className="mt-4 flex gap-2 sm:mt-0 sm:flex-none">
        <button
          type="button"
          className="cta-button cta-button--outline cta-button--small flex-1 sm:flex-none"
          onClick={() => chooseConsent("denied")}
        >
          No thanks
        </button>
        <button
          type="button"
          className="cta-button cta-button--light cta-button--small flex-1 sm:flex-none"
          onClick={() => chooseConsent("granted")}
        >
          Allow analytics
        </button>
      </div>
    </aside>
  );
}
