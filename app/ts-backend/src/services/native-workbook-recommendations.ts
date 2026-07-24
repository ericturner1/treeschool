type RecommendationCatalogItem = {
  id: string;
  catalogKind: "workbook" | "bundle";
  memberWorkbookIds?: readonly string[];
};

/**
 * ACC recommendations should be precise gap-fillers. Re-offering a bundle that
 * contains material already attached to the learning year is confusing and can
 * make an updated bundle look like an entirely new curriculum. Its unattached
 * members remain eligible as individual workbook recommendations.
 */
export function catalogItemOverlapsAttachedWorkbooks(
  item: RecommendationCatalogItem,
  attachedWorkbookIds: ReadonlySet<string>
) {
  if (item.catalogKind === "bundle") {
    return (item.memberWorkbookIds ?? []).some((id) => attachedWorkbookIds.has(id));
  }
  return attachedWorkbookIds.has(item.id);
}
