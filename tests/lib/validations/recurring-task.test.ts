import { describe, it, expect } from 'vitest';
import {
  recurrenceRuleSchema,
  recurringTaskCreateSchema,
  editScopeSchema,
} from '@/lib/validations/recurring-task';

describe('recurrenceRuleSchema', () => {
  it('should accept a valid daily rule', () => {
    const result = recurrenceRuleSchema.safeParse({
      frequency: 'daily',
      interval: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should accept a valid weekly rule with days', () => {
    const result = recurrenceRuleSchema.safeParse({
      frequency: 'weekly',
      interval: 1,
      days_of_week: [1, 3, 5],
    });
    expect(result.success).toBe(true);
  });

  it('should accept a valid monthly-by-date rule', () => {
    const result = recurrenceRuleSchema.safeParse({
      frequency: 'monthly',
      interval: 1,
      day_of_month: 15,
    });
    expect(result.success).toBe(true);
  });

  it('should accept a valid monthly-by-weekday rule', () => {
    const result = recurrenceRuleSchema.safeParse({
      frequency: 'monthly',
      interval: 1,
      week_position: 'first',
      day_of_week_monthly: 1,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid frequency', () => {
    const result = recurrenceRuleSchema.safeParse({
      frequency: 'hourly',
      interval: 1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject interval < 1', () => {
    const result = recurrenceRuleSchema.safeParse({
      frequency: 'daily',
      interval: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject day_of_week out of range', () => {
    const result = recurrenceRuleSchema.safeParse({
      frequency: 'weekly',
      interval: 1,
      days_of_week: [7],
    });
    expect(result.success).toBe(false);
  });
});

describe('recurringTaskCreateSchema', () => {
  const validBase = {
    title: 'Daily standup',
    recurrence_rule: { frequency: 'daily', interval: 1 },
    start_date: '2026-02-17',
    end_type: 'never',
  };

  it('should accept a valid create payload', () => {
    const result = recurringTaskCreateSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('should accept with all optional fields', () => {
    const result = recurringTaskCreateSchema.safeParse({
      ...validBase,
      description: 'Morning standup meeting',
      intention: 'Stay aligned with team',
      priority: 2,
      category: 'work',
      due_time: '09:00:00',
      end_type: 'after_count',
      end_count: 30,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing title', () => {
    const result = recurringTaskCreateSchema.safeParse({
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid start_date format', () => {
    const result = recurringTaskCreateSchema.safeParse({
      ...validBase,
      start_date: '02/17/2026',
    });
    expect(result.success).toBe(false);
  });
});

describe('editScopeSchema', () => {
  it('should accept "this"', () => {
    expect(editScopeSchema.safeParse('this').success).toBe(true);
  });

  it('should accept "following"', () => {
    expect(editScopeSchema.safeParse('following').success).toBe(true);
  });

  it('should accept "all"', () => {
    expect(editScopeSchema.safeParse('all').success).toBe(true);
  });

  it('should reject invalid values', () => {
    expect(editScopeSchema.safeParse('none').success).toBe(false);
  });
});
