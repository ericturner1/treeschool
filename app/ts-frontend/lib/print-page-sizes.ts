export const PRINT_PAGE_SIZE_OPTIONS = [
  { value: "letter", label: "US Letter (8.5 × 11 in)" },
  { value: "a4", label: "A4 (210 × 297 mm)" },
  { value: "legal", label: "US Legal (8.5 × 14 in)" }
] as const;

export type PrintPageSize = (typeof PRINT_PAGE_SIZE_OPTIONS)[number]["value"];

export function isPrintPageSize(value: unknown): value is PrintPageSize {
  return PRINT_PAGE_SIZE_OPTIONS.some((option) => option.value === value);
}

export function printPageSizeLabel(value: PrintPageSize | null | undefined) {
  return PRINT_PAGE_SIZE_OPTIONS.find((option) => option.value === value)?.label ?? "Not set";
}

export function compactPrintPageSizeLabel(value: PrintPageSize | null | undefined) {
  return PRINT_PAGE_SIZE_OPTIONS.find((option) => option.value === value)?.label.split(" (")[0] ?? "Not set";
}
