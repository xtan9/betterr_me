import { describe, it, expect } from 'vitest';
import {
  calendarEventCreateSchema,
  calendarEventUpdateSchema,
} from '@/lib/validations/calendar-events';

describe('calendarEventCreateSchema', () => {
  const validMinimal = {
    title: 'Meeting',
    start_date: '2026-04-01',
    end_date: '2026-04-01',
  };

  it('should accept a minimal valid event (all-day)', () => {
    const result = calendarEventCreateSchema.safeParse(validMinimal);
    expect(result.success).toBe(true);
  });

  it('should accept a full valid event with all optional fields', () => {
    const result = calendarEventCreateSchema.safeParse({
      title: 'Weekly Sync',
      start_date: '2026-04-01',
      start_time: '09:00',
      end_date: '2026-04-01',
      end_time: '10:00',
      location: 'Office',
      description: 'Weekly team sync',
      color: '#ff0000',
      category_id: '550e8400-e29b-41d4-a716-446655440000',
      is_recurring: false,
    });
    expect(result.success).toBe(true);
  });

  it('should trim title whitespace', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      title: '  Trimmed Title  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Trimmed Title');
    }
  });

  it('should reject empty title', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject whitespace-only title', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      title: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('should reject title longer than 200 characters', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      title: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      start_date: '04-01-2026',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid end_date format', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      end_date: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('should accept time in HH:MM format', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      start_time: '09:00',
      end_time: '10:00',
    });
    expect(result.success).toBe(true);
  });

  it('should accept time in HH:MM:SS format', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      start_time: '09:00:00',
      end_time: '10:00:00',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid time format', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      start_time: '9am',
    });
    expect(result.success).toBe(false);
  });

  it('should accept null start_time (all-day event)', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      start_time: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject end_time without start_time', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      end_time: '10:00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages).toContain(
        'end_time cannot be set without start_time (all-day event)'
      );
    }
  });

  it('should reject is_recurring=true without recurrence_rule', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      is_recurring: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages).toContain(
        'recurrence_rule is required when is_recurring is true'
      );
    }
  });

  it('should accept is_recurring=true with recurrence_rule', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      is_recurring: true,
      recurrence_rule: { frequency: 'daily', interval: 1 },
    });
    expect(result.success).toBe(true);
  });

  it('should accept is_recurring=true with weekly recurrence_rule', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      is_recurring: true,
      recurrence_rule: {
        frequency: 'weekly',
        interval: 1,
        days_of_week: [1, 3, 5],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should default is_recurring to false', () => {
    const result = calendarEventCreateSchema.safeParse(validMinimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_recurring).toBe(false);
    }
  });

  it('should reject invalid category_id (not UUID)', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      category_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject description longer than 2000 characters', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      description: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('should reject location longer than 500 characters', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      location: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should require end_date', () => {
    const result = calendarEventCreateSchema.safeParse({
      title: 'Meeting',
      start_date: '2026-04-01',
    });
    expect(result.success).toBe(false);
  });

  it('should reject end_date before start_date', () => {
    const result = calendarEventCreateSchema.safeParse({
      title: 'Meeting',
      start_date: '2026-04-05',
      end_date: '2026-04-01',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a non-ISO timestamp for an absolute reminder', () => {
    const result = calendarEventCreateSchema.safeParse({
      ...validMinimal,
      reminders: [{
        reminder_type: 'absolute',
        relative_minutes: null,
        absolute_time: 'tomorrow morning',
        channels: ['push'],
      }],
    });

    expect(result.success).toBe(false);
  });
});

describe('calendarEventUpdateSchema', () => {
  it('should accept partial update with just title', () => {
    const result = calendarEventUpdateSchema.safeParse({
      title: 'Updated Title',
    });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with just start_date', () => {
    const result = calendarEventUpdateSchema.safeParse({
      start_date: '2026-05-01',
    });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with multiple fields', () => {
    const result = calendarEventUpdateSchema.safeParse({
      title: 'Updated',
      location: 'New Office',
      color: '#00ff00',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty object', () => {
    const result = calendarEventUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages).toContain('At least one field must be provided');
    }
  });

  it('should reject invalid date format in update', () => {
    const result = calendarEventUpdateSchema.safeParse({
      start_date: 'bad-date',
    });
    expect(result.success).toBe(false);
  });
});
