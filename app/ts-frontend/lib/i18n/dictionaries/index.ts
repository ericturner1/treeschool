import en from "./en";
import { DEFAULT_LOCALE, type SupportedLocale } from "../config";

const dictionaries = {
  en
} as const;

export type AppDictionary = (typeof dictionaries)[typeof DEFAULT_LOCALE];

export async function getDictionary(locale: SupportedLocale): Promise<AppDictionary> {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
