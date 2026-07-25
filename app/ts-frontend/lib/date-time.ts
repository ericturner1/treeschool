function safeTimeZone(value: string | null | undefined) {
  const candidate = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}
export function formatDateTimeInTimeZone(
  value: string | Date,
  timeZone: string | null | undefined,
  locale = "en-US"
) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: safeTimeZone(timeZone),
    timeZoneName: "short"
  }).format(new Date(value));
}
