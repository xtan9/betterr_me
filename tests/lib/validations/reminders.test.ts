import { describe, it, expect } from 'vitest';
import {
  reminderCreateSchema,
  reminderUpdateSchema,
} from '@/lib/validations/reminders';

describe('reminderCreateSchema', () => {
  const validRelative = {
    source_type: 'calendar_event' as const,
    source_id: '550e8400-e29b-41d4-a716-446655440000',
    reminder_type: 'relative' as const,
    relative_minutes: -15,
    channels: ['push' as const],
  };

  const validAbsolute = {
    source_type: 'task' as const,
    source_id: '550e8400-e29b-41d4-a716-446655440000',
    reminder_type: 'absolute' as const,
    absolute_time: '2026-04-01T09:00:00Z',
    channels: ['push' as const, 'email' as const],
  };

  it('should accept a valid relative reminder', () => {
    const result = reminderCreateSchema.safeParse(validRelative);
    expect(result.success).toBe(true);
  });

  it('should accept a valid absolute reminder', () => {
    const result = reminderCreateSchema.safeParse(validAbsolute);
    expect(result.success).toBe(true);
  });

  it('should accept source_type "calendar_event"', () => {
    const result = reminderCreateSchema.safeParse(validRelative);
    expect(result.success).toBe(true);
  });

  it('should accept source_type "task"', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      source_type: 'task',
    });
    expect(result.success).toBe(true);
  });

  it('should accept source_type "habit"', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      source_type: 'habit',
    });
    expect(result.success).toBe(true);
  });

  it('should accept source_type "bill"', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      source_type: 'bill',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid source_type', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      source_type: 'meeting',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid source_id (not UUID)', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      source_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty channels array', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      channels: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid channel', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      channels: ['sms'],
    });
    expect(result.success).toBe(false);
  });

  it('should reject relative reminder without relative_minutes', () => {
    const result = reminderCreateSchema.safeParse({
      source_type: 'calendar_event',
      source_id: '550e8400-e29b-41d4-a716-446655440000',
      reminder_type: 'relative',
      channels: ['push'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages).toContain(
        "relative_minutes is required when reminder_type is 'relative'"
      );
    }
  });

  it('should reject absolute reminder without absolute_time', () => {
    const result = reminderCreateSchema.safeParse({
      source_type: 'task',
      source_id: '550e8400-e29b-41d4-a716-446655440000',
      reminder_type: 'absolute',
      channels: ['push'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages).toContain(
        "absolute_time is required when reminder_type is 'absolute'"
      );
    }
  });

  it('should accept relative reminder with relative_minutes and no absolute_time', () => {
    const result = reminderCreateSchema.safeParse({
      source_type: 'calendar_event',
      source_id: '550e8400-e29b-41d4-a716-446655440000',
      reminder_type: 'relative',
      relative_minutes: -30,
      channels: ['push'],
    });
    expect(result.success).toBe(true);
  });

  it('should accept multiple channels', () => {
    const result = reminderCreateSchema.safeParse({
      ...validRelative,
      channels: ['push', 'email'],
    });
    expect(result.success).toBe(true);
  });
});

describe('reminderUpdateSchema', () => {
  it('should accept partial update with status', () => {
    const result = reminderUpdateSchema.safeParse({ status: 'sent' });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with channels', () => {
    const result = reminderUpdateSchema.safeParse({ channels: ['email'] });
    expect(result.success).toBe(true);
  });

  it('should accept partial update with fire_at', () => {
    const result = reminderUpdateSchema.safeParse({
      fire_at: '2026-04-01T09:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty object', () => {
    const result = reminderUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages).toContain('At least one field must be provided');
    }
  });

  it('should reject invalid status', () => {
    const result = reminderUpdateSchema.safeParse({ status: 'cancelled' });
    expect(result.success).toBe(false);
  });

  it('should reject empty channels array', () => {
    const result = reminderUpdateSchema.safeParse({ channels: [] });
    expect(result.success).toBe(false);
  });
});
