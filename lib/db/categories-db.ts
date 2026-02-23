import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, CategoryInsert } from "./types";

/**
 * Database access class for the categories table.
 * Handles system categories (household_id IS NULL) and custom household categories.
 */
export class CategoriesDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all categories: system defaults (household_id IS NULL) plus household custom categories.
   * Ordered by is_system DESC (system first), then name ASC.
   */
  async getAll(householdId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from("categories")
      .select("*")
      .or(`household_id.is.null,household_id.eq.${householdId}`)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get visible categories for a household (excludes hidden categories).
   * Returns system + custom categories minus any in hidden_categories for this household.
   */
  async getVisible(householdId: string): Promise<Category[]> {
    // First get hidden category IDs
    const hiddenIds = await this.getHidden(householdId);

    // Get all categories
    let query = this.supabase
      .from("categories")
      .select("*")
      .or(`household_id.is.null,household_id.eq.${householdId}`)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });

    // Exclude hidden categories if any
    if (hiddenIds.length > 0) {
      query = query.not("id", "in", `(${hiddenIds.join(",")})`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Create a custom category for a household.
   */
  async create(data: CategoryInsert): Promise<Category> {
    const { data: result, error } = await this.supabase
      .from("categories")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Update category fields (name, icon, color, display_name).
   */
  async update(
    id: string,
    data: Partial<Pick<Category, "name" | "icon" | "color" | "display_name">>
  ): Promise<Category> {
    const { data: result, error } = await this.supabase
      .from("categories")
      .update(data)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Delete a custom category. Verifies is_system = false before deleting.
   */
  async delete(id: string): Promise<void> {
    // Verify not a system category
    const { data: category, error: fetchError } = await this.supabase
      .from("categories")
      .select("is_system")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;
    if (category?.is_system) {
      throw new Error("Cannot delete system categories");
    }

    const { error } = await this.supabase
      .from("categories")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  /**
   * Hide a category for a household.
   */
  async hide(householdId: string, categoryId: string): Promise<void> {
    const { error } = await this.supabase
      .from("hidden_categories")
      .insert({ household_id: householdId, category_id: categoryId });

    if (error) throw error;
  }

  /**
   * Unhide a category for a household.
   */
  async unhide(householdId: string, categoryId: string): Promise<void> {
    const { error } = await this.supabase
      .from("hidden_categories")
      .delete()
      .eq("household_id", householdId)
      .eq("category_id", categoryId);

    if (error) throw error;
  }

  /**
   * Get list of hidden category IDs for a household.
   */
  async getHidden(householdId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("hidden_categories")
      .select("category_id")
      .eq("household_id", householdId);

    if (error) throw error;
    return (data || []).map((row) => row.category_id);
  }
}
