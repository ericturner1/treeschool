"use client";

import { useEffect, useState } from "react";
import { formatDateTimeInTimeZone } from "../lib/date-time";

export function LocalDateTime({
  value,
  fallbackTimeZone
}: {
  value: string;
  fallbackTimeZone: string;
}) {
  const [timeZone, setTimeZone] = useState(fallbackTimeZone || "UTC");

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone) setTimeZone(browserTimeZone);
  }, []);

  return (
    <time dateTime={value}>
      {formatDateTimeInTimeZone(value, timeZone)}
    </time>
  );
}
