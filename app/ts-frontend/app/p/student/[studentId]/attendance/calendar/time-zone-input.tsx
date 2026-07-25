"use client";

import { useEffect, useState } from "react";

export function TimeZoneInput({ initialValue }: { initialValue: string }) {
  const [timeZone, setTimeZone] = useState(initialValue || "UTC");

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone) setTimeZone(browserTimeZone);
  }, []);

  return <input type="hidden" name="timeZone" value={timeZone} />;
}
