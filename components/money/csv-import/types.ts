export type ColumnMapping = Record<string, string | null>;

export interface ImportResult {
  imported: number;
  duplicates_skipped: number;
}
