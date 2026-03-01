import { SEED_CATEGORIES } from "./seed";

const DEFAULT_CATEGORY_NAMES = new Set(SEED_CATEGORIES.map((c) => c.name));

export function getCategoryDisplayName(
  name: string,
  t: (key: string) => string
): string {
  if (DEFAULT_CATEGORY_NAMES.has(name)) {
    return t(`defaults.${name}`);
  }
  return name;
}
