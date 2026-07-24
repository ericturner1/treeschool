export function parseWorkbookPriceInCents(value: FormDataEntryValue | null) {
  const input = String(value ?? "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input);
  if (!match) return null;

  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const priceInCents = (dollars * 100) + cents;
  return Number.isSafeInteger(priceInCents) && priceInCents <= 100_000
    ? priceInCents
    : null;
}
