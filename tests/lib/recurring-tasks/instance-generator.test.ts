import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// We test ensureRecurringInstances by mocking Supabase
describe('ensureRecurringInstances', () => {
  const createChain = (finalData: unknown = null, finalError: unknown = null) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: finalData, error: finalError }),
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: finalData, error: finalError }).then(resolve),
    };
    return chain;
  };

  let mockSupabase: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no active templates
    const emptyChain = createChain([], null);
    mockSupabase = {
      from: vi.fn().mockReturnValue(emptyChain),
    };
  });

  it('should do nothing when no active templates need generation', async () => {
    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await ensureRecurringInstances(mockSupabase as any, 'user-1', '2026-02-20');

    expect(mockSupabase.from).toHaveBeenCalledWith('recurring_tasks');
  });

  it('should generate instances for a daily recurring task', async () => {
    const template = {
      id: 'tmpl-1',
      user_id: 'user-1',
      title: 'Daily standup',
      description: null,
      intention: null,
      priority: 1,
      category: 'work',
      due_time: '09:00:00',
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'never',
      end_date: null,
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    let callCount = 0;
    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && callCount === 0) {
        callCount++;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        return createChain([], null);
      }
      if (table === 'recurring_tasks') {
        return createChain(template, null);
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20');

    // Should have called from('tasks') for inserting instances
    const tasksCalls = mockFromFn.mock.calls.filter(
      (c: string[]) => c[0] === 'tasks'
    );
    expect(tasksCalls.length).toBeGreaterThan(0);
  });
});
