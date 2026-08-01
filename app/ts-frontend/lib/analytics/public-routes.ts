const PUBLIC_ANALYTICS_EXACT_PATHS = new Set([
  "/",
  "/faq",
  "/first-grade-homeschool",
  "/first-grade-curriculum",
  "/first-grade-homeschool-curriculum",
  "/homeschool-without-a-subscription",
  "/pricing",
  "/privacy",
  "/refunds",
  "/support",
  "/switch-to-paper-based-homeschool",
  "/terms"
]);

const PUBLIC_ANALYTICS_PATH_PREFIXES = [
  "/blog/",
  "/bookstore/",
  "/f/",
  "/homeschool-lesson-plan-generator/",
  "/offers/ds/",
  "/offers/us/"
];

const PUBLIC_ANALYTICS_PREFIX_ROOTS = new Set([
  "/blog",
  "/bookstore",
  "/homeschool-lesson-plan-generator"
]);

const PRODUCTION_HOSTNAMES = new Set([
  "treehomeschool.com",
  "www.treehomeschool.com"
]);

const PRIOR_CONSENT_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK"
]);

export function isPublicAnalyticsPath(pathname: string) {
  if (
    PUBLIC_ANALYTICS_EXACT_PATHS.has(pathname) ||
    PUBLIC_ANALYTICS_PREFIX_ROOTS.has(pathname)
  ) {
    return true;
  }

  return PUBLIC_ANALYTICS_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
}

export function shouldEnablePublicAnalytics(
  pathname: string,
  hostname: string
) {
  return (
    PRODUCTION_HOSTNAMES.has(hostname.toLowerCase()) &&
    isPublicAnalyticsPath(pathname)
  );
}

export function requiresPriorAnalyticsConsent(
  countryCode: string | null | undefined
) {
  if (!countryCode?.trim()) return true;
  return PRIOR_CONSENT_COUNTRY_CODES.has(countryCode.trim().toUpperCase());
}
