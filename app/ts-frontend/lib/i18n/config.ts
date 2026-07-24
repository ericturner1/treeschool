export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE_NAME = "treeschool_lang";

export const SUPPORTED_LOCALES = [
  {
    code: "en",
    label: "English"
  }
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

export function isSupportedLocale(value: string | undefined): value is SupportedLocale {
  return SUPPORTED_LOCALES.some((locale) => locale.code === value);
}

export function resolveLocale(value?: string): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}
