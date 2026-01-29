/**
 * Database utilities index
 * Centralized exports for all database operations
 */

export { habitsDB, HabitsDB } from './habits';
export { categoriesDB, CategoriesDB } from './categories';

// Re-export types
export type * from '@/lib/types/database';
