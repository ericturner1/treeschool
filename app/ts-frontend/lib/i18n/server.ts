import { cookies } from "next/headers";
import { getDictionary } from "./dictionaries";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  resolveLocale,
  type SupportedLocale
} from "./config";

export function getRequestLocale(searchLang?: string): SupportedLocale {
  const cookieLocale = cookies().get(LOCALE_COOKIE_NAME)?.value;

  return resolveLocale(searchLang ?? cookieLocale ?? DEFAULT_LOCALE);
}

export async function getRequestDictionary(searchLang?: string) {
  const locale = getRequestLocale(searchLang);
  const dictionary = await getDictionary(locale);

  return {
    locale,
    dictionary
  };
}
