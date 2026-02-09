import { describe, it, expect } from 'vitest';
import { profileFormSchema } from '@/lib/validations/profile';

describe('profileFormSchema', () => {
  it('accepts valid full_name and avatar_url', () => {
    const result = profileFormSchema.safeParse({
      full_name: 'John Doe',
      avatar_url: 'https://example.com/avatar.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty full_name (null)', () => {
    const result = profileFormSchema.safeParse({
      full_name: null,
      avatar_url: 'https://example.com/avatar.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects full_name over 100 chars', () => {
    const result = profileFormSchema.safeParse({
      full_name: 'a'.repeat(101),
      avatar_url: null,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid URL for avatar_url', () => {
    const result = profileFormSchema.safeParse({
      full_name: 'Test',
      avatar_url: 'https://example.com/avatar.png',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty string for avatar_url', () => {
    const result = profileFormSchema.safeParse({
      full_name: 'Test',
      avatar_url: '',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null for avatar_url', () => {
    const result = profileFormSchema.safeParse({
      full_name: 'Test',
      avatar_url: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL for avatar_url', () => {
    const result = profileFormSchema.safeParse({
      full_name: 'Test',
      avatar_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts both fields missing', () => {
    const result = profileFormSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
