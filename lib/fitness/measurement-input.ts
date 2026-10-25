/** Null is an explicit clear; undefined is unfinished or invalid text to keep in the editor. */
export function parseWholeInput(text: string, minimum: number, maximum: number): number | null | undefined {
  if (text === "") return null;
  if (text.length > 128 || !/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}
