import { config } from "dotenv";
import { currencies, denominations, locales } from "ts-db";

config({ path: "./app/ts-backend/.env" });
config();

const currencySeed = [
  {
    code: "USD",
    name: "United States Dollar",
    symbol: "$",
    minorUnit: 2,
    denominations: [
      { name: "penny", minorValue: 1, type: "COIN" as const, rank: 1 },
      { name: "nickel", minorValue: 5, type: "COIN" as const, rank: 2 },
      { name: "dime", minorValue: 10, type: "COIN" as const, rank: 3 },
      { name: "quarter", minorValue: 25, type: "COIN" as const, rank: 4 },
      { name: "one dollar bill", minorValue: 100, type: "BILL" as const, rank: 5 },
      { name: "five dollar bill", minorValue: 500, type: "BILL" as const, rank: 6 }
    ]
  },
  {
    code: "JPY",
    name: "Japanese Yen",
    symbol: "¥",
    minorUnit: 0,
    denominations: [
      { name: "1 yen coin", minorValue: 1, type: "COIN" as const, rank: 1 },
      { name: "5 yen coin", minorValue: 5, type: "COIN" as const, rank: 2 },
      { name: "10 yen coin", minorValue: 10, type: "COIN" as const, rank: 3 },
      { name: "50 yen coin", minorValue: 50, type: "COIN" as const, rank: 4 },
      { name: "100 yen coin", minorValue: 100, type: "COIN" as const, rank: 5 },
      { name: "500 yen coin", minorValue: 500, type: "COIN" as const, rank: 6 },
      { name: "1000 yen note", minorValue: 1000, type: "BILL" as const, rank: 7 }
    ]
  }
] as const;

const localeSeed = [
  {
    countryCode: "US",
    languageCode: "en-US",
    currencyCode: "USD"
  },
  {
    countryCode: "JP",
    languageCode: "ja-JP",
    currencyCode: "JPY"
  }
] as const;

async function main() {
  const { db, client } = await import("../app/ts-backend/src/db");

  for (const currency of currencySeed) {
    await db
      .insert(currencies)
      .values({
        code: currency.code,
        name: currency.name,
        symbol: currency.symbol,
        minorUnit: currency.minorUnit
      })
      .onConflictDoUpdate({
        target: currencies.code,
        set: {
          name: currency.name,
          symbol: currency.symbol,
          minorUnit: currency.minorUnit
        }
      });

    for (const denomination of currency.denominations) {
      await db
        .insert(denominations)
        .values({
          currencyCode: currency.code,
          name: denomination.name,
          minorValue: denomination.minorValue,
          type: denomination.type,
          rank: denomination.rank
        })
        .onConflictDoNothing();
    }
  }

  for (const locale of localeSeed) {
    await db
      .insert(locales)
      .values(locale)
      .onConflictDoNothing();
  }

  await client.end();
  console.log("Seeded locales, currencies, and denominations.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
