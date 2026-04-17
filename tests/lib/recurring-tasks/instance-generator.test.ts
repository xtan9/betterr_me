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
      priority: 1,
      category_id: null,
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

  it('should throw when templates fetch returns an error', async () => {
    const errorChain = createChain(null, { message: 'db exploded' });
    const supabase = {
      from: vi.fn().mockReturnValue(errorChain),
    };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await expect(
      ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20')
    ).rejects.toThrow(/failed to fetch templates: db exploded/);
  });

  it('should constrain rangeEnd when end_type="on_date" and end_date < throughDate', async () => {
    const template = {
      id: 'tmpl-end-date',
      user_id: 'user-1',
      title: 'Ends early',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'on_date',
      end_date: '2026-02-18', // ends before throughDate 2026-02-20
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    const insertCalls: unknown[][] = [];
    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        const chain = createChain([], null);
        const originalInsert = chain.insert;
        chain.insert = vi.fn((arg: unknown) => {
          insertCalls.push([arg]);
          return originalInsert(arg);
        });
        return chain;
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

    // Only 2 instances should be inserted (17 and 18), not through the 20th
    expect(insertCalls.length).toBe(1);
    const inserted = insertCalls[0][0] as Array<{ original_date: string }>;
    expect(inserted).toHaveLength(2);
    expect(inserted.map(i => i.original_date)).toEqual([
      '2026-02-17',
      '2026-02-18',
    ]);
  });

  it('should archive template when end_type="after_count" and remaining count <= 0', async () => {
    const template = {
      id: 'tmpl-maxed',
      user_id: 'user-1',
      title: 'All done',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'after_count',
      end_date: null,
      end_count: 3,
      instances_generated: 3, // already at limit
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    const updateCalls: unknown[][] = [];
    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'recurring_tasks') {
        const chain = createChain(null, null);
        const origUpdate = chain.update;
        chain.update = vi.fn((arg: unknown) => {
          updateCalls.push([arg]);
          return origUpdate(arg);
        });
        return chain;
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20');

    // Should archive the template
    expect(updateCalls.length).toBeGreaterThan(0);
    const archivePayload = updateCalls[0][0] as { status?: string };
    expect(archivePayload.status).toBe('archived');
  });

  it('should log error (not throw) when archive update fails', async () => {
    const { log } = await import('@/lib/logger');
    const template = {
      id: 'tmpl-archive-fail',
      user_id: 'user-1',
      title: 'Archive fail',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'after_count',
      end_date: null,
      end_count: 1,
      instances_generated: 5,
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'recurring_tasks') {
        return createChain(null, { message: 'update failed' });
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await expect(
      ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20')
    ).resolves.toBeUndefined();

    // archive error logged (top-level catch may also log, but archive path logs specifically)
    expect(log.error).toHaveBeenCalled();
  });

  it('should slice occurrences to remaining when end_type="after_count"', async () => {
    const template = {
      id: 'tmpl-count-remaining',
      user_id: 'user-1',
      title: 'Limited run',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'after_count',
      end_date: null,
      end_count: 5,
      instances_generated: 3, // remaining = 2
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    const insertCalls: unknown[][] = [];
    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        const chain = createChain([], null);
        const origInsert = chain.insert;
        chain.insert = vi.fn((arg: unknown) => {
          insertCalls.push([arg]);
          return origInsert(arg);
        });
        return chain;
      }
      if (table === 'recurring_tasks') {
        return createChain(null, null);
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20');

    // throughDate spans 2026-02-17 to 2026-02-20 (4 occurrences), but remaining=2
    expect(insertCalls.length).toBe(1);
    const inserted = insertCalls[0][0] as Array<{ original_date: string }>;
    expect(inserted).toHaveLength(2);
    expect(inserted.map(i => i.original_date)).toEqual([
      '2026-02-17',
      '2026-02-18',
    ]);
  });

  it('should filter out occurrences with existing instances', async () => {
    const template = {
      id: 'tmpl-dup',
      user_id: 'user-1',
      title: 'Dedup',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'never',
      end_date: null,
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    const insertCalls: unknown[][] = [];
    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        const chain = createChain(
          [
            { original_date: '2026-02-17' },
            { original_date: '2026-02-19' },
          ],
          null
        );
        const origInsert = chain.insert;
        chain.insert = vi.fn((arg: unknown) => {
          insertCalls.push([arg]);
          return origInsert(arg);
        });
        return chain;
      }
      if (table === 'recurring_tasks') {
        return createChain(null, null);
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20');

    expect(insertCalls.length).toBe(1);
    const inserted = insertCalls[0][0] as Array<{ original_date: string }>;
    // existing: 17 and 19 — only 18 and 20 should be inserted
    expect(inserted.map(i => i.original_date).sort()).toEqual([
      '2026-02-18',
      '2026-02-20',
    ]);
  });

  it('should swallow throw when existing instances query errors (inner try/catch logs)', async () => {
    const { log } = await import('@/lib/logger');
    const template = {
      id: 'tmpl-existing-err',
      user_id: 'user-1',
      title: 'Existing err',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'never',
      end_date: null,
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        return createChain(null, { message: 'existing select failed' });
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    // Inner throw is caught by outer try/catch in the loop, so promise resolves
    await expect(
      ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20')
    ).resolves.toBeUndefined();

    // The outer catch logs the thrown Error with message containing "Failed to check existing instances"
    expect(log.error).toHaveBeenCalled();
    const calls = (log.error as any).mock.calls;
    const thrownErrorMatch = calls.some((call: unknown[]) => {
      const err = call[1] as Error | undefined;
      return (
        err instanceof Error &&
        err.message.includes('Failed to check existing instances')
      );
    });
    expect(thrownErrorMatch).toBe(true);
  });

  it('should log error (not throw) when insert fails', async () => {
    const { log } = await import('@/lib/logger');
    const template = {
      id: 'tmpl-insert-fail',
      user_id: 'user-1',
      title: 'Insert fail',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'never',
      end_date: null,
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    let templatesFetched = false;
    let tasksCallCount = 0;
    const updateCalls: unknown[][] = [];

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        tasksCallCount++;
        if (tasksCallCount === 1) {
          // existing instances query: returns empty, no error
          return createChain([], null);
        }
        // insert returns error
        return createChain(null, { message: 'insert boom' });
      }
      if (table === 'recurring_tasks') {
        const chain = createChain(null, null);
        const origUpdate = chain.update;
        chain.update = vi.fn((arg: unknown) => {
          updateCalls.push([arg]);
          return origUpdate(arg);
        });
        return chain;
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await expect(
      ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20')
    ).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalled();
    // After insert fails, function returns early — no template update happens
    expect(updateCalls.length).toBe(0);
  });

  it('should advance next_generate_date even when no occurrences in window', async () => {
    // A weekly template whose next_generate_date range falls between weekdays
    // with no occurrence in that window. Feb 16 2026 is Monday; window Feb
    // 17 (Tue) through Feb 22 (Sun) contains no Monday.
    const template = {
      id: 'tmpl-empty',
      user_id: 'user-1',
      title: 'Empty window',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'weekly', interval: 1, days_of_week: [1] },
      start_date: '2026-02-16', // Monday
      end_type: 'never',
      end_date: null,
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-17', // Tue
      status: 'active',
    };

    const updateCalls: unknown[][] = [];
    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'recurring_tasks') {
        const chain = createChain(null, null);
        const origUpdate = chain.update;
        chain.update = vi.fn((arg: unknown) => {
          updateCalls.push([arg]);
          return origUpdate(arg);
        });
        return chain;
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    // throughDate Feb 22 (Sun); no Monday in Feb 17-22 window
    await ensureRecurringInstances(supabase as any, 'user-1', '2026-02-22');

    // Template should have been updated with nextGenDate = throughDate + 1 = 2026-02-23
    expect(updateCalls.length).toBe(1);
    const payload = updateCalls[0][0] as {
      next_generate_date: string;
      instances_generated: number;
    };
    expect(payload.next_generate_date).toBe('2026-02-23');
    expect(payload.instances_generated).toBe(0);
  });

  it('should calculate nextDay correctly (throughDate + 1) across month boundary', async () => {
    const template = {
      id: 'tmpl-month-end',
      user_id: 'user-1',
      title: 'Month end',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-28',
      end_type: 'never',
      end_date: null,
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-28',
      status: 'active',
    };

    const updateCalls: unknown[][] = [];
    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        return createChain([], null);
      }
      if (table === 'recurring_tasks') {
        const chain = createChain(null, null);
        const origUpdate = chain.update;
        chain.update = vi.fn((arg: unknown) => {
          updateCalls.push([arg]);
          return origUpdate(arg);
        });
        return chain;
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await ensureRecurringInstances(supabase as any, 'user-1', '2026-02-28');

    expect(updateCalls.length).toBe(1);
    const payload = updateCalls[0][0] as { next_generate_date: string };
    // 2026-02-28 + 1 = 2026-03-01
    expect(payload.next_generate_date).toBe('2026-03-01');
  });

  it('should log error when updateTemplateAfterGeneration fails', async () => {
    const { log } = await import('@/lib/logger');
    const template = {
      id: 'tmpl-update-fail',
      user_id: 'user-1',
      title: 'Update fail',
      description: null,
      priority: 1,
      category_id: null,
      due_time: null,
      recurrence_rule: { frequency: 'daily', interval: 1 },
      start_date: '2026-02-17',
      end_type: 'never',
      end_date: null,
      end_count: null,
      instances_generated: 0,
      next_generate_date: '2026-02-17',
      status: 'active',
    };

    let templatesFetched = false;

    const mockFromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'recurring_tasks' && !templatesFetched) {
        templatesFetched = true;
        return createChain([template], null);
      }
      if (table === 'tasks') {
        return createChain([], null);
      }
      if (table === 'recurring_tasks') {
        return createChain(null, { message: 'update failed' });
      }
      return createChain(null, null);
    });

    const supabase = { from: mockFromFn };

    // Clear prior log.error calls
    (log.error as any).mockClear();

    const { ensureRecurringInstances } = await import(
      '@/lib/recurring-tasks/instance-generator'
    );

    await expect(
      ensureRecurringInstances(supabase as any, 'user-1', '2026-02-20')
    ).resolves.toBeUndefined();

    // Verify a log.error call with message 'Failed to update template after generation'
    const calls = (log.error as any).mock.calls;
    const updateFailLogged = calls.some((call: unknown[]) => {
      return (
        typeof call[0] === 'string' &&
        (call[0] as string).includes('Failed to update template after generation')
      );
    });
    expect(updateFailLogged).toBe(true);
  });
});
