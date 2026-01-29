import { describe, it, expect, beforeEach, vi } from 'vitest';
import { categoriesDB } from '@/lib/db/categories';
import { mockSupabaseClient } from '../../setup';
import type { Category, InsertCategory } from '@/lib/types/database';

describe('CategoriesDB', () => {
  beforeEach(() => {
    // Reset mock responses but keep chainable setup
    mockSupabaseClient.setMockResponse(null, null);
    // Clear call history
    vi.clearAllMocks();
  });

  describe('getUserCategories', () => {
    it('should fetch all categories for a user ordered by sort_order', async () => {
      const mockCategories: Category[] = [
        {
          id: '1',
          user_id: 'user1',
          name: 'Health',
          style: { color: '#10B981', icon: 'heart' },
          sort_order: 0,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          user_id: 'user1',
          name: 'Work',
          style: { color: '#3B82F6', icon: 'briefcase' },
          sort_order: 1,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockSupabaseClient.setMockResponse(mockCategories, null);

      const result = await categoriesDB.getUserCategories('user1');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('categories');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'user1');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('sort_order', {
        ascending: true,
      });
      expect(result).toEqual(mockCategories);
    });

    it('should return empty array when user has no categories', async () => {
      mockSupabaseClient.setMockResponse([], null);

      const result = await categoriesDB.getUserCategories('user1');

      expect(result).toEqual([]);
    });
  });

  describe('createCategory', () => {
    it('should create a new category', async () => {
      const newCategory: InsertCategory = {
        user_id: 'user1',
        name: 'Personal Growth',
        style: { color: '#8B5CF6', icon: 'sparkles' },
        sort_order: 0,
      };

      const createdCategory: Category = {
        ...newCategory,
        id: 'new-category-id',
        created_at: '2024-01-29T00:00:00Z',
        updated_at: '2024-01-29T00:00:00Z',
      };

      mockSupabaseClient.setMockResponse(createdCategory, null);

      const result = await categoriesDB.createCategory(newCategory);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('categories');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(newCategory);
      expect(result).toEqual(createdCategory);
    });

    it('should throw error on duplicate category name', async () => {
      const duplicateCategory: InsertCategory = {
        user_id: 'user1',
        name: 'Health',
        style: { color: '#10B981', icon: 'heart' },
        sort_order: 0,
      };

      const duplicateError = { code: '23505', message: 'duplicate key value' };

      mockSupabaseClient.setMockResponse(null, duplicateError);

      await expect(categoriesDB.createCategory(duplicateCategory)).rejects.toEqual(
        duplicateError
      );
    });
  });

  describe('updateCategory', () => {
    it('should update category name and style', async () => {
      const updates = {
        name: 'Fitness',
        style: { color: '#EF4444', icon: 'dumbbell' },
      };

      const updatedCategory: Category = {
        id: 'cat1',
        user_id: 'user1',
        name: 'Fitness',
        style: { color: '#EF4444', icon: 'dumbbell' },
        sort_order: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-29T00:00:00Z',
      };

      mockSupabaseClient.setMockResponse(updatedCategory, null);

      const result = await categoriesDB.updateCategory('cat1', 'user1', updates);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(result).toEqual(updatedCategory);
    });
  });

  describe('deleteCategory', () => {
    it('should delete a category', async () => {
      mockSupabaseClient.setMockResponse(null, null);

      await categoriesDB.deleteCategory('cat1', 'user1');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('categories');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'cat1');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', 'user1');
    });
  });

  describe('reorderCategories', () => {
    it('should update sort_order for multiple categories', async () => {
      const categoryOrders = [
        { id: 'cat1', sort_order: 2 },
        { id: 'cat2', sort_order: 0 },
        { id: 'cat3', sort_order: 1 },
      ];

      mockSupabaseClient.setMockResponse(null, null);

      await categoriesDB.reorderCategories('user1', categoryOrders);

      expect(mockSupabaseClient.update).toHaveBeenCalledTimes(3);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ sort_order: 2 });
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ sort_order: 0 });
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ sort_order: 1 });
    });

    it('should throw error if any update fails', async () => {
      const categoryOrders = [
        { id: 'cat1', sort_order: 0 },
        { id: 'cat2', sort_order: 1 },
      ];

      const updateError = new Error('Update failed');

      // First call succeeds, second fails
      mockSupabaseClient.setMockResponse(null, updateError);

      await expect(
        categoriesDB.reorderCategories('user1', categoryOrders)
      ).rejects.toThrow('Update failed');
    });
  });
});
