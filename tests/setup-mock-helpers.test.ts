import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseClient } from './setup';

// Tests the query-tracking helpers added to MockQueryBuilder. These catch
// regressions that the existing DB tests don't — specifically, table-identity
// swaps and method-argument corruption.
describe('MockQueryBuilder query-tracking helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.setMockResponse(null);
  });

  it('records a from() call with table name', () => {
    mockSupabaseClient.from('habits');
    expect(mockSupabaseClient.queryLog).toEqual([
      { table: 'habits', method: 'from', args: ['habits'] },
    ]);
  });

  it('records chained calls with the correct table attributed to each', async () => {
    mockSupabaseClient.from('habits').select('*').eq('user_id', 'u1');

    expect(mockSupabaseClient.queryLog).toEqual([
      { table: 'habits', method: 'from', args: ['habits'] },
      { table: 'habits', method: 'select', args: ['*'] },
      { table: 'habits', method: 'eq', args: ['user_id', 'u1'] },
    ]);
  });

  it('tracks the current table across multiple from() chains', () => {
    mockSupabaseClient.from('habits').select('*');
    mockSupabaseClient.from('tasks').eq('id', 't1');

    expect(mockSupabaseClient.queryLog).toEqual([
      { table: 'habits', method: 'from', args: ['habits'] },
      { table: 'habits', method: 'select', args: ['*'] },
      { table: 'tasks', method: 'from', args: ['tasks'] },
      { table: 'tasks', method: 'eq', args: ['id', 't1'] },
    ]);
  });

  it('records single() as a terminal call', async () => {
    mockSupabaseClient.setMockResponse({ id: '1' });
    await mockSupabaseClient.from('habits').select('*').single();

    expect(
      mockSupabaseClient.queryLog.at(-1),
    ).toEqual({ table: 'habits', method: 'single', args: [] });
  });

  it('expectQuery matches by table + method + args', () => {
    mockSupabaseClient.from('habits').eq('user_id', 'u1');

    expect(() =>
      mockSupabaseClient.expectQuery({
        table: 'habits',
        method: 'eq',
        args: ['user_id', 'u1'],
      }),
    ).not.toThrow();
  });

  it('expectQuery matches by table only', () => {
    mockSupabaseClient.from('habits').select('*');

    const entry = mockSupabaseClient.expectQuery({ table: 'habits' });
    expect(entry.method).toBe('from');
  });

  it('expectQuery throws with diagnostic when no match found', () => {
    mockSupabaseClient.from('habits').eq('user_id', 'u1');

    expect(() =>
      mockSupabaseClient.expectQuery({
        table: 'tasks', // wrong table
        method: 'eq',
      }),
    ).toThrow(/no matching call/);
  });

  it('resetQueryLog clears entries and currentTable', () => {
    mockSupabaseClient.from('habits').eq('user_id', 'u1');
    expect(mockSupabaseClient.queryLog).toHaveLength(2);

    mockSupabaseClient.resetQueryLog();
    expect(mockSupabaseClient.queryLog).toEqual([]);

    // currentTable also cleared — next from() call is fresh.
    mockSupabaseClient.eq('x', 'y');
    expect(mockSupabaseClient.queryLog).toEqual([
      { table: null, method: 'eq', args: ['x', 'y'] },
    ]);
  });

  it('vi.clearAllMocks() also clears the query log', () => {
    mockSupabaseClient.from('habits').eq('user_id', 'u1');
    expect(mockSupabaseClient.queryLog).toHaveLength(2);

    vi.clearAllMocks();
    expect(mockSupabaseClient.queryLog).toEqual([]);
  });
});
