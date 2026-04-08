import catalogData from "./exercise-catalog.json";

export interface CatalogEntry {
  name: string;
  muscle_group_primary: string;
  muscle_groups_secondary: string[];
  equipment: string;
  exercise_type: string;
  exercisedb_id: string | null;
  exercisedb_name: string | null;
  gif_url: string | null;
}

export function loadCatalog(): CatalogEntry[] {
  return catalogData as CatalogEntry[];
}
