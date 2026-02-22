import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, CategoryInsert, CategoryUpdate } from "./types";

/** CRUD + lazy-seeding for user-defined categories. */
export class CategoriesDB {
  constructor(private supabase: SupabaseClient) {}

  /** Get all categories for a user, ordered by sort_order. */
  async getUserCategories(userId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Get a single category by id, scoped to the user. Returns null if not found (PGRST116). */
  async getCategory(id: string, userId: string): Promise<Category | null> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw error;
    }
    return data;
  }

  /** Create a new category. */
  async createCategory(category: CategoryInsert): Promise<Category> {
    const { data, error } = await this.supabase
      .from("categories")
      .insert(category)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Update a category. Throws PGRST116 if not found (caught by API route as 404). */
  async updateCategory(
    id: string,
    userId: string,
    updates: CategoryUpdate
  ): Promise<Category> {
    const { data, error } = await this.supabase
      .from("categories")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Delete a category. Related tasks/habits have category_id set to NULL (ON DELETE SET NULL). */
  async deleteCategory(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }

  /** Idempotent: returns existing categories, or seeds 12 defaults if the user has none. */
  async seedCategories(userId: string): Promise<Category[]> {
    const existing = await this.getUserCategories(userId);
    if (existing.length > 0) return existing;

    const { SEED_CATEGORIES } = await import("@/lib/categories/seed");
    const inserts: CategoryInsert[] = SEED_CATEGORIES.map((cat, i) => ({
      user_id: userId,
      name: cat.name,
      color: cat.color,
      icon: cat.icon ?? null,
      sort_order: i,
    }));

    const { data, error } = await this.supabase
      .from("categories")
      .insert(inserts)
      .select();
    if (error) throw error;
    return data ?? [];
  }
}
