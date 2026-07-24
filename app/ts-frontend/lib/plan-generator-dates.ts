export function defaultSchoolYearEnd(startDate: string) {
  const [year, month, day] = startDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const end = new Date(Date.UTC(year + 1, month - 1, day));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export function applySchoolYearStartDateChange({
  nextStartDate,
  currentEndDate,
  endDateSuggestionLocked
}: {
  nextStartDate: string;
  currentEndDate: string;
  endDateSuggestionLocked: boolean;
}) {
  if (!nextStartDate) {
    return { endDate: "", endDateSuggestionLocked };
  }
  if (endDateSuggestionLocked) {
    return { endDate: currentEndDate, endDateSuggestionLocked };
  }
  return {
    endDate: defaultSchoolYearEnd(nextStartDate),
    endDateSuggestionLocked: false
  };
}

export function restoreSchoolYearPeriod(startDate?: string, endDate?: string) {
  const restoredStartDate = startDate?.trim() || "";
  if (!restoredStartDate) {
    return {
      startDate: "",
      endDate: "",
      endDateSuggestionLocked: false
    };
  }
  return {
    startDate: restoredStartDate,
    endDate: endDate?.trim() || defaultSchoolYearEnd(restoredStartDate),
    endDateSuggestionLocked: true
  };
}

export function compactSchoolYearPeriod(startDate: string, endDate: string) {
  if (!startDate || !endDate) return "Dates needed";
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
  return `${formatter.format(new Date(`${startDate}T00:00:00.000Z`))}–${formatter.format(new Date(`${endDate}T00:00:00.000Z`))}`;
}
