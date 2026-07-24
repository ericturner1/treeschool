export function hideCatalogItemsCoveredBySelection<T extends {
  id: string;
  memberWorkbookIds: string[];
}>(catalog: T[], selectedIds: string[]) {
  const selectedIdSet = new Set(selectedIds);
  const coveredWorkbookIds = new Set(
    catalog
      .filter((item) => selectedIdSet.has(item.id))
      .flatMap((item) => item.memberWorkbookIds)
  );

  return catalog.filter((item) =>
    selectedIdSet.has(item.id) ||
    !item.memberWorkbookIds.some((workbookId) => coveredWorkbookIds.has(workbookId))
  );
}
