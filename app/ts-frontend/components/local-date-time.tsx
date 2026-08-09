import { formatDateTimeInTimeZone } from "../lib/date-time";

export function LocalDateTime({
  value,
  timeZone
}: {
  value: string;
  timeZone: string;
}) {
  return (
    <time dateTime={value}>
      {formatDateTimeInTimeZone(value, timeZone || "UTC")}
    </time>
  );
}
