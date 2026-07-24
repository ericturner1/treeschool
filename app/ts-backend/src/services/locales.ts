import { asc, eq } from "drizzle-orm";
import { currencies, denominations, locales } from "ts-db";
import { db } from "../db";

export async function getLocaleAssets(localeId: string) {
  const [locale] = await db
    .select({
      id: locales.id,
      countryCode: locales.countryCode,
      languageCode: locales.languageCode,
      currencyCode: locales.currencyCode,
      currencyName: currencies.name,
      currencySymbol: currencies.symbol,
      minorUnit: currencies.minorUnit
    })
    .from(locales)
    .innerJoin(currencies, eq(locales.currencyCode, currencies.code))
    .where(eq(locales.id, localeId))
    .limit(1);

  if (!locale) {
    throw new Error(`Locale ${localeId} not found.`);
  }

  const denominationRows = await db
    .select({
      id: denominations.id,
      name: denominations.name,
      minorValue: denominations.minorValue,
      type: denominations.type,
      rank: denominations.rank
    })
    .from(denominations)
    .where(eq(denominations.currencyCode, locale.currencyCode))
    .orderBy(asc(denominations.rank));

  return {
    id: locale.id,
    countryCode: locale.countryCode,
    languageCode: locale.languageCode,
    currencyCode: locale.currencyCode,
    currencyName: locale.currencyName,
    currencySymbol: locale.currencySymbol,
    minorUnit: locale.minorUnit,
    denominations: denominationRows.map((row) => ({
      ...row,
      displayValue: formatMinorCurrencyValue(
        row.minorValue,
        locale.currencySymbol,
        locale.minorUnit
      )
    }))
  };
}

function formatMinorCurrencyValue(minorValue: number, symbol: string, minorUnit: number) {
  if (minorUnit <= 0) {
    return `${symbol}${minorValue}`;
  }

  return `${symbol}${(minorValue / 10 ** minorUnit).toFixed(minorUnit)}`;
}
