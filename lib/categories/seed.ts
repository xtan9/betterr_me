export interface SeedCategory {
  name: string;
  color: string;
  icon?: string;
}

export const SEED_CATEGORIES: SeedCategory[] = [
  // Personal-oriented
  { name: "Errands", color: "orange", icon: "shopping-cart" },
  { name: "Health", color: "red", icon: "heart" },
  { name: "Finance", color: "green", icon: "dollar-sign" },
  { name: "Home", color: "yellow", icon: "home" },
  { name: "Social", color: "pink", icon: "users" },
  { name: "Learning", color: "indigo", icon: "book-open" },
  // Work-oriented
  { name: "Meetings", color: "blue", icon: "video" },
  { name: "Planning", color: "purple", icon: "layout" },
  { name: "Development", color: "teal", icon: "code" },
  { name: "Research", color: "cyan", icon: "search" },
  { name: "Admin", color: "slate", icon: "settings" },
  { name: "Review", color: "emerald", icon: "check-circle" },
];
