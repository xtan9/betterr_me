/**
 * Database utilities for Category operations
 */

import { createClient } from '@/lib/supabase/client';
import type { Category, InsertCategory, UpdateCategory } from '@/lib/types/database';

export class CategoriesDB {
  private supabase = createClient();

  /**
   * Get all categories for a user
   */
  async getUserCategories(userId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single category by ID
   */
  async getCategory(categoryId: string, userId: string): Promise<Category | null> {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .eq('id', categoryId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  /**
   * Create a new category
   */
  async createCategory(category: InsertCategory): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .insert(category)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a category
   */
  async updateCategory(
    categoryId: string,
    userId: string,
    updates: UpdateCategory
  ): Promise<Category> {
    const { data, error } = await this.supabase
      .from('categories')
      .update(updates)
      .eq('id', categoryId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete a category
   */
  async deleteCategory(categoryId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Reorder categories
   */
  async reorderCategories(
    userId: string,
    categoryOrders: Array<{ id: string; sort_order: number }>
  ): Promise<void> {
    const updates = categoryOrders.map((item) =>
      this.supabase
        .from('categories')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
        .eq('user_id', userId)
    );

    const results = await Promise.all(updates);
    const error = results.find((r) => r.error)?.error;
    if (error) throw error;
  }
}

// Export singleton instance
export const categoriesDB = new CategoriesDB();
