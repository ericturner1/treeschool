export function expandSelectedNativeWorkbookCards<T extends {
  id: string;
  catalogKind: "workbook" | "bundle";
  memberWorkbookIds: string[];
}>(catalog: T[], selectedIds: string[]) {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const seenWorkbookIds = new Set<string>();
  const cards: Array<{ workbook: T; selection: T }> = [];
  for (const selectedId of selectedIds) {
    const selection = byId.get(selectedId);
    if (!selection) continue;
    for (const workbookId of selection.memberWorkbookIds) {
      const workbook = byId.get(workbookId);
      if (!workbook || workbook.catalogKind !== "workbook" || seenWorkbookIds.has(workbook.id)) continue;
      seenWorkbookIds.add(workbook.id);
      cards.push({ workbook, selection });
    }
  }
  return cards;
}
