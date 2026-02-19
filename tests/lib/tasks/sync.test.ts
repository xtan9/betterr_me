import { describe, it, expect, vi } from 'vitest';
import { syncTaskCreate, syncTaskUpdate } from '@/lib/tasks/sync';
import type { TaskInsert, TaskUpdate } from '@/lib/db/types';

describe('syncTaskCreate', () => {
  it('defaults to status=todo, is_completed=false, completed_at=null when no status provided', () => {
    const input: TaskInsert = {
      user_id: 'user-1',
      title: 'Test task',
      description: null,
      is_completed: false,
      priority: 0,
      due_date: null,
      due_time: null,
    };
    const result = syncTaskCreate(input);
    expect(result.status).toBe('todo');
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('sets is_completed=true and completed_at timestamp when status=done', () => {
    const input: TaskInsert = {
      user_id: 'user-1',
      title: 'Done task',
      description: null,
      is_completed: false,
      priority: 0,
      due_date: null,
      due_time: null,
      status: 'done',
    };
    const result = syncTaskCreate(input);
    expect(result.status).toBe('done');
    expect(result.is_completed).toBe(true);
    expect(result.completed_at).toEqual(expect.any(String));
    expect(new Date(result.completed_at!).getTime()).not.toBeNaN();
  });

  it('sets is_completed=false, completed_at=null when status=backlog', () => {
    const input: TaskInsert = {
      user_id: 'user-1',
      title: 'Backlog task',
      description: null,
      is_completed: false,
      priority: 0,
      due_date: null,
      due_time: null,
      status: 'backlog',
    };
    const result = syncTaskCreate(input);
    expect(result.status).toBe('backlog');
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('sets is_completed=false, completed_at=null when status=in_progress', () => {
    const input: TaskInsert = {
      user_id: 'user-1',
      title: 'In progress task',
      description: null,
      is_completed: false,
      priority: 0,
      due_date: null,
      due_time: null,
      status: 'in_progress',
    };
    const result = syncTaskCreate(input);
    expect(result.status).toBe('in_progress');
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('defaults section to personal when not provided', () => {
    const input: TaskInsert = {
      user_id: 'user-1',
      title: 'No section task',
      description: null,
      is_completed: false,
      priority: 0,
      due_date: null,
      due_time: null,
    };
    const result = syncTaskCreate(input);
    expect(result.section).toBe('personal');
  });

  it('uses provided section when specified', () => {
    const input: TaskInsert = {
      user_id: 'user-1',
      title: 'Custom section task',
      description: null,
      is_completed: false,
      priority: 0,
      due_date: null,
      due_time: null,
      section: 'work-project',
    };
    const result = syncTaskCreate(input);
    expect(result.section).toBe('work-project');
  });

  it('preserves all other input fields in output', () => {
    const input: TaskInsert = {
      user_id: 'user-1',
      title: 'Full task',
      description: 'A description',
      is_completed: false,
      priority: 2,
      due_date: '2026-03-01',
      due_time: '10:00:00',
      category: 'work',
      intention: 'Get it done',
    };
    const result = syncTaskCreate(input);
    expect(result.user_id).toBe('user-1');
    expect(result.title).toBe('Full task');
    expect(result.description).toBe('A description');
    expect(result.priority).toBe(2);
    expect(result.due_date).toBe('2026-03-01');
    expect(result.due_time).toBe('10:00:00');
    expect(result.category).toBe('work');
    expect(result.intention).toBe('Get it done');
  });
});

describe('syncTaskUpdate', () => {
  it('sets is_completed=true and completed_at when only status=done', () => {
    const updates: TaskUpdate = { status: 'done' };
    const result = syncTaskUpdate(updates);
    expect(result.is_completed).toBe(true);
    expect(result.completed_at).toEqual(expect.any(String));
    expect(new Date(result.completed_at!).getTime()).not.toBeNaN();
  });

  it('sets is_completed=false and completed_at=null when only status=todo', () => {
    const updates: TaskUpdate = { status: 'todo' };
    const result = syncTaskUpdate(updates);
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('sets is_completed=false and completed_at=null when only status=backlog', () => {
    const updates: TaskUpdate = { status: 'backlog' };
    const result = syncTaskUpdate(updates);
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('sets is_completed=false and completed_at=null when only status=in_progress', () => {
    const updates: TaskUpdate = { status: 'in_progress' };
    const result = syncTaskUpdate(updates);
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('sets status=done and completed_at when only is_completed=true', () => {
    const updates: TaskUpdate = { is_completed: true };
    const result = syncTaskUpdate(updates);
    expect(result.status).toBe('done');
    expect(result.completed_at).toEqual(expect.any(String));
  });

  it('sets status=todo and completed_at=null when only is_completed=false (reopened)', () => {
    const updates: TaskUpdate = { is_completed: false };
    const result = syncTaskUpdate(updates);
    expect(result.status).toBe('todo');
    expect(result.completed_at).toBeNull();
  });

  it('status wins when both status=done and is_completed=false are provided', () => {
    const updates: TaskUpdate = { status: 'done', is_completed: false };
    const result = syncTaskUpdate(updates);
    expect(result.status).toBe('done');
    expect(result.is_completed).toBe(true);
    expect(result.completed_at).toEqual(expect.any(String));
  });

  it('status wins when both status=todo and is_completed=true are provided', () => {
    const updates: TaskUpdate = { status: 'todo', is_completed: true };
    const result = syncTaskUpdate(updates);
    expect(result.status).toBe('todo');
    expect(result.is_completed).toBe(false);
    expect(result.completed_at).toBeNull();
  });

  it('returns input unchanged when neither status nor is_completed provided', () => {
    const updates: TaskUpdate = {};
    const result = syncTaskUpdate(updates);
    expect(result).toEqual({});
  });

  it('returns input unchanged when only title changed', () => {
    const updates: TaskUpdate = { title: 'New title' };
    const result = syncTaskUpdate(updates);
    expect(result).toEqual({ title: 'New title' });
  });
});
