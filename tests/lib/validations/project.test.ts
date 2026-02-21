import { describe, it, expect } from 'vitest';
import {
  projectFormSchema,
  projectUpdateSchema,
  projectStatusSchema,
} from '@/lib/validations/project';

describe('projectStatusSchema', () => {
  it('accepts "active"', () => {
    const result = projectStatusSchema.safeParse('active');
    expect(result.success).toBe(true);
  });

  it('accepts "archived"', () => {
    const result = projectStatusSchema.safeParse('archived');
    expect(result.success).toBe(true);
  });

  it('rejects invalid status strings', () => {
    expect(projectStatusSchema.safeParse('deleted').success).toBe(false);
    expect(projectStatusSchema.safeParse('pending').success).toBe(false);
    expect(projectStatusSchema.safeParse('').success).toBe(false);
  });
});

describe('projectFormSchema', () => {
  const validProject = {
    name: 'My Project',
    section: 'personal',
    color: '#3b82f6',
  };

  it('accepts valid project data', () => {
    const result = projectFormSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = projectFormSchema.safeParse({
      section: 'personal',
      color: '#3b82f6',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 50 characters', () => {
    const result = projectFormSchema.safeParse({
      ...validProject,
      name: 'a'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 50 characters', () => {
    const result = projectFormSchema.safeParse({
      ...validProject,
      name: 'a'.repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing section', () => {
    const result = projectFormSchema.safeParse({
      name: 'Test',
      color: '#3b82f6',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid section value', () => {
    const result = projectFormSchema.safeParse({
      ...validProject,
      section: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing color', () => {
    const result = projectFormSchema.safeParse({
      name: 'Test',
      section: 'personal',
    });
    expect(result.success).toBe(false);
  });
});

describe('projectUpdateSchema', () => {
  it('accepts {status: "archived"} (archive use case)', () => {
    const result = projectUpdateSchema.safeParse({ status: 'archived' });
    expect(result.success).toBe(true);
  });

  it('accepts {status: "active"} (restore use case)', () => {
    const result = projectUpdateSchema.safeParse({ status: 'active' });
    expect(result.success).toBe(true);
  });

  it('accepts name-only update', () => {
    const result = projectUpdateSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts color-only update', () => {
    const result = projectUpdateSchema.safeParse({ color: '#ef4444' });
    expect(result.success).toBe(true);
  });

  it('accepts section-only update', () => {
    const result = projectUpdateSchema.safeParse({ section: 'work' });
    expect(result.success).toBe(true);
  });

  it('accepts mixed fields (name + status)', () => {
    const result = projectUpdateSchema.safeParse({
      name: 'Updated',
      status: 'archived',
    });
    expect(result.success).toBe(true);
  });

  it('rejects {status: "deleted"} (invalid status value)', () => {
    const result = projectUpdateSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });

  it('rejects {status: "pending"} (invalid status value)', () => {
    const result = projectUpdateSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('rejects empty body {} (non-empty refine guard)', () => {
    const result = projectUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 50 characters', () => {
    const result = projectUpdateSchema.safeParse({ name: 'a'.repeat(51) });
    expect(result.success).toBe(false);
  });
});
