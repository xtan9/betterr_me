import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';

// Retirement verification executes client-facing tests with legacy Profile
// paths disabled. Retained server compatibility routes are tested directly.
process.env.TEST_LEGACY_PROFILE_CLIENT_PATHS = 'disabled';

// Silence console noise during tests (API error handlers, etc.)
// Restore with vi.restoreAllMocks() in individual tests if needed.
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Mock ResizeObserver (used by cmdk and other components)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

// DOM polyfills — only apply in jsdom environment (tests using @vitest-environment node skip these)
if (typeof Element !== 'undefined') {
  // Mock scrollIntoView (not available in jsdom)
  Element.prototype.scrollIntoView = vi.fn();

  // Polyfill pointer capture methods for Radix UI components in jsdom
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}

// Create a thenable query builder mock (like Supabase's real behavior)
// It chains methods AND can be awaited to return { data, error }
//
// The mock records each call as a (table, method, args) tuple so tests can
// assert on which table was queried — catches bugs where .from("X") gets
// swapped to .from("Y") and the shared-mock response happens to match both.
//
// Helpers:
//   mockSupabaseClient.queryLog     — array of { table, method, args }
//   mockSupabaseClient.resetQueryLog() — called automatically in beforeEach
//   expectQuery({ table, method?, args? }) — assert at least one matching call
//
// The query log is cleared automatically via `vi.clearAllMocks()` call in
// tests, but `resetQueryLog()` should also be called in `beforeEach` in
// tests that rely on precise counts.
interface QueryLogEntry {
  table: string | null;
  method: string;
  args: unknown[];
}

class MockQueryBuilder {
  private mockData: any = null;
  private mockError: any = null;
  private mockCount: number | null = null;
  private currentTable: string | null = null;

  // All calls recorded here. Reset via resetQueryLog() or vi.clearAllMocks().
  queryLog: QueryLogEntry[] = [];

  private record(method: string, args: unknown[]) {
    this.queryLog.push({ table: this.currentTable, method, args });
  }

  // Chainable methods
  from = vi.fn((table: string) => {
    this.currentTable = table;
    this.record('from', [table]);
    return this;
  });
  select = vi.fn((...args: unknown[]) => {
    this.record('select', args);
    return this;
  });
  insert = vi.fn((...args: unknown[]) => {
    this.record('insert', args);
    return this;
  });
  upsert = vi.fn((...args: unknown[]) => {
    this.record('upsert', args);
    return this;
  });
  update = vi.fn((...args: unknown[]) => {
    this.record('update', args);
    return this;
  });
  delete = vi.fn((...args: unknown[]) => {
    this.record('delete', args);
    return this;
  });
  eq = vi.fn((...args: unknown[]) => {
    this.record('eq', args);
    return this;
  });
  in = vi.fn((...args: unknown[]) => {
    this.record('in', args);
    return this;
  });
  is = vi.fn((...args: unknown[]) => {
    this.record('is', args);
    return this;
  });
  not = vi.fn((...args: unknown[]) => {
    this.record('not', args);
    return this;
  });
  gt = vi.fn((...args: unknown[]) => {
    this.record('gt', args);
    return this;
  });
  gte = vi.fn((...args: unknown[]) => {
    this.record('gte', args);
    return this;
  });
  lt = vi.fn((...args: unknown[]) => {
    this.record('lt', args);
    return this;
  });
  lte = vi.fn((...args: unknown[]) => {
    this.record('lte', args);
    return this;
  });
  neq = vi.fn((...args: unknown[]) => {
    this.record('neq', args);
    return this;
  });
  or = vi.fn((...args: unknown[]) => {
    this.record('or', args);
    return this;
  });
  order = vi.fn((...args: unknown[]) => {
    this.record('order', args);
    return this;
  });
  limit = vi.fn((...args: unknown[]) => {
    this.record('limit', args);
    return this;
  });
  range = vi.fn((...args: unknown[]) => {
    this.record('range', args);
    return this;
  });
  rpc = vi.fn((...args: unknown[]) => {
    this.currentTable = null;
    this.record('rpc', args);
    return Promise.resolve({ data: this.mockData, error: this.mockError });
  });

  // Terminal methods that return a promise
  single = vi.fn(() => {
    this.record('single', []);
    return Promise.resolve({ data: this.mockData, error: this.mockError });
  });
  maybeSingle = vi.fn(() => {
    this.record('maybeSingle', []);
    return Promise.resolve({ data: this.mockData, error: this.mockError });
  });

  // Make this thenable so it can be awaited or destructured
  then(onFulfilled?: any, onRejected?: any) {
    return Promise.resolve({ data: this.mockData, error: this.mockError, count: this.mockCount }).then(
      onFulfilled,
      onRejected
    );
  }

  // Helper to set mock responses
  setMockResponse(data: any, error: any = null, count: number | null = null) {
    this.mockData = data;
    this.mockError = error;
    this.mockCount = count;
    return this;
  }

  // Clear the query log. Useful in beforeEach when you're about to assert
  // on specific calls. vi.clearAllMocks() also clears it.
  resetQueryLog() {
    this.queryLog = [];
    this.currentTable = null;
  }

  // Assert at least one recorded call matches the given shape.
  // Example:
  //   expectQuery({ table: 'habits', method: 'eq', args: ['user_id', 'u1'] })
  // Any field omitted means "don't care".
  //
  // `args` matching uses `isDeepStrictEqual` so Date, undefined, nested
  // objects, and symbols compare correctly (unlike JSON.stringify which
  // coerces Date→string and drops undefined).
  expectQuery(match: {
    table?: string | null;
    method?: string;
    args?: unknown[];
  }): QueryLogEntry {
    const found = this.queryLog.find(
      (entry) =>
        (match.table === undefined || entry.table === match.table) &&
        (match.method === undefined || entry.method === match.method) &&
        (match.args === undefined ||
          isDeepStrictEqual(entry.args, match.args)),
    );
    if (!found) {
      const matchStr = JSON.stringify(match);
      const logStr = JSON.stringify(this.queryLog, null, 2);
      throw new Error(
        `expectQuery: no matching call.\nWanted: ${matchStr}\nGot: ${logStr}`,
      );
    }
    return found;
  }
}

export const mockSupabaseClient = new MockQueryBuilder();

// Reset the per-call query log automatically when vi.clearAllMocks() fires in
// tests (the existing pattern in beforeEach). Without this override, the log
// would leak across tests. We also provide resetQueryLog() for explicit use.
const originalClearAllMocks = vi.clearAllMocks.bind(vi);
vi.clearAllMocks = () => {
  const result = originalClearAllMocks();
  mockSupabaseClient.resetQueryLog();
  return result;
};

// Mock createClient
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabaseClient,
}));
