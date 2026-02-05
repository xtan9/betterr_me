import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver (used by cmdk and other components)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Create a thenable query builder mock (like Supabase's real behavior)
// It chains methods AND can be awaited to return { data, error }
class MockQueryBuilder {
  private mockData: any = null;
  private mockError: any = null;

  // Chainable methods
  from = vi.fn().mockReturnThis();
  select = vi.fn().mockReturnThis();
  insert = vi.fn().mockReturnThis();
  upsert = vi.fn().mockReturnThis();
  update = vi.fn().mockReturnThis();
  delete = vi.fn().mockReturnThis();
  eq = vi.fn().mockReturnThis();
  in = vi.fn().mockReturnThis();
  is = vi.fn().mockReturnThis();
  not = vi.fn().mockReturnThis();
  gt = vi.fn().mockReturnThis();
  gte = vi.fn().mockReturnThis();
  lt = vi.fn().mockReturnThis();
  lte = vi.fn().mockReturnThis();
  order = vi.fn().mockReturnThis();

  // Terminal method that returns a promise
  single = vi.fn(() => Promise.resolve({ data: this.mockData, error: this.mockError }));

  // Make this thenable so it can be awaited or destructured
  then(onFulfilled?: any, onRejected?: any) {
    return Promise.resolve({ data: this.mockData, error: this.mockError }).then(
      onFulfilled,
      onRejected
    );
  }

  // Helper to set mock responses
  setMockResponse(data: any, error: any = null) {
    this.mockData = data;
    this.mockError = error;
    return this;
  }
}

export const mockSupabaseClient = new MockQueryBuilder();

// Mock createClient
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabaseClient,
}));
