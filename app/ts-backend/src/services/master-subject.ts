const MASTER_SUBJECT_PREFIX = "master_subject:";

export type MasterSubjectSource = {
  academicStandardKey: string;
  key: string;
  label: string;
  aliases?: string[] | null;
};

export function masterSubjectStorageKey(input: Pick<MasterSubjectSource, "academicStandardKey" | "key">) {
  return `${MASTER_SUBJECT_PREFIX}${input.academicStandardKey}:${input.key}`;
}

export function parseMasterSubjectStorageKey(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized.startsWith(MASTER_SUBJECT_PREFIX)) return null;
  const [academicStandardKey, key, ...extra] = normalized
    .slice(MASTER_SUBJECT_PREFIX.length)
    .split(":");
  if (
    !academicStandardKey ||
    !key ||
    extra.length > 0 ||
    !/^[a-z0-9_-]+$/i.test(academicStandardKey) ||
    !/^[a-z0-9_-]+$/i.test(key)
  ) return null;
  return { academicStandardKey, key };
}

export function masterSubjectDisplayLabel(input: MasterSubjectSource) {
  const aliases = (input.aliases ?? []).map((alias) => alias.trim()).filter(Boolean);
  if (input.academicStandardKey === "japan") {
    const nativeAlias = aliases.find((alias) => /[\u3040-\u30ff\u3400-\u9fff]/u.test(alias));
    if (nativeAlias) return nativeAlias;
    const parentheticalNativeLabel = input.label.match(/\(([^)]*[\u3040-\u30ff\u3400-\u9fff][^)]*)\)/u)?.[1]?.trim();
    if (parentheticalNativeLabel) return parentheticalNativeLabel;
  }
  return input.label.trim();
}
