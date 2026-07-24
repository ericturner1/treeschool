import type { PrintPageSize } from "./print-page-sizes";

const LETTER_COUNTRY_CODES = new Set([
  "CA",
  "CL",
  "CO",
  "CR",
  "DO",
  "GT",
  "MX",
  "PA",
  "PH",
  "US"
]);

const COUNTRY_HEADER_NAMES = [
  "x-treeschool-ip-country",
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "x-appengine-country",
  "x-country-code"
] as const;

export function inferPrintPageSizeFromCountry(countryCode: string | null | undefined): PrintPageSize | null {
  const normalized = countryCode?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized) || normalized === "XX") return null;
  return LETTER_COUNTRY_CODES.has(normalized) ? "letter" : "a4";
}

export function inferPrintPageSizeFromHeaders(requestHeaders: Pick<Headers, "get">) {
  for (const headerName of COUNTRY_HEADER_NAMES) {
    const inferred = inferPrintPageSizeFromCountry(requestHeaders.get(headerName));
    if (inferred) return inferred;
  }
  return null;
}
