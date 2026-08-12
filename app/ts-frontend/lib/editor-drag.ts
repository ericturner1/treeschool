export function moveItemAtInsertionPoint<T>(
  source: T[],
  sourceIndex: number,
  target: T[],
  insertionIndex: number,
) {
  if (sourceIndex < 0 || sourceIndex >= source.length) return null;
  const [item] = source.splice(sourceIndex, 1);
  if (item === undefined) return null;

  const adjustedIndex = source === target && insertionIndex > sourceIndex
    ? insertionIndex - 1
    : insertionIndex;
  const destinationIndex = Math.min(Math.max(adjustedIndex, 0), target.length);
  target.splice(destinationIndex, 0, item);
  return destinationIndex;
}
