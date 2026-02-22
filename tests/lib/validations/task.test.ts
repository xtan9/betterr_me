import { describe, it, expect } from 'vitest';
import { taskFormSchema } from '@/lib/validations/task';

describe('taskFormSchema', () => {
  it('accepts valid minimal task data', () => {
    const result = taskFormSchema.safeParse({
      title: 'Buy groceries',
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid full task data', () => {
    const result = taskFormSchema.safeParse({
      title: 'Weekly report',
      description: 'Compile the weekly metrics report',
      priority: 2,
      category_id: '550e8400-e29b-41d4-a716-446655440000',
      due_date: '2026-02-10',
      due_time: '14:30',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = taskFormSchema.safeParse({
      title: '',
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Title is required');
  });

  it('rejects title longer than 100 characters', () => {
    const result = taskFormSchema.safeParse({
      title: 'a'.repeat(101),
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('Title must be 100 characters or less');
  });

  it('accepts title at exactly 100 characters', () => {
    const result = taskFormSchema.safeParse({
      title: 'a'.repeat(100),
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid priority values', () => {
    for (const priority of [0, 1, 2, 3] as const) {
      const result = taskFormSchema.safeParse({
        title: 'Test',
        priority,
        category_id: null,
        due_date: null,
        due_time: null,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid priority value', () => {
    const result = taskFormSchema.safeParse({
      title: 'Test',
      priority: 5,
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid category_id (UUID)', () => {
    const result = taskFormSchema.safeParse({
      title: 'Test',
      priority: 0,
      category_id: '550e8400-e29b-41d4-a716-446655440000',
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category_id (non-UUID string)', () => {
    const result = taskFormSchema.safeParse({
      title: 'Test',
      priority: 0,
      category_id: 'invalid',
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(false);
  });

  it('accepts null category_id', () => {
    const result = taskFormSchema.safeParse({
      title: 'Test',
      priority: 0,
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts nullable description', () => {
    const result = taskFormSchema.safeParse({
      title: 'Test',
      priority: 0,
      description: null,
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects description longer than 500 characters', () => {
    const result = taskFormSchema.safeParse({
      title: 'Test',
      priority: 0,
      description: 'a'.repeat(501),
      category_id: null,
      due_date: null,
      due_time: null,
    });
    expect(result.success).toBe(false);
  });

});
