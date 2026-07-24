export const PLAN_GENERATOR_ACCEPTED_FILE_TYPES =
  "application/pdf,.pdf,text/plain,text/markdown,.txt,.md,.markdown,.csv,.tsv,image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff";

export const PLAN_GENERATOR_MAX_INPUT_PAGE_COUNT = 2000;

export const PLAN_GENERATOR_PARITY_FIELDS = [
  "holidayWeeks",
  "teachingDaysPerWeek",
  "preferredPrintPageSize",
  "prerequisiteMaterialSetId"
] as const;
