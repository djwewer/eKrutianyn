/** Converts a spreadsheet column letter ("A", "B", ..., "AA", ...) to its 0-based index. */
export function columnLetterToIndex(column: string): number {
  let index = 0;
  for (const char of column) {
    index = index * 26 + (char.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
  }
  return index - 1;
}
