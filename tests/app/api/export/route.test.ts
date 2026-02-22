import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoist mocks
const { mockGetUser, mockSupabaseFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockSupabaseFrom: vi.fn(),
}));

const mockGetUserHabits = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockSupabaseFrom,
  })),
}));

const mockZipFile = vi.fn();
const mockGenerateAsync = vi.fn();

vi.mock('@/lib/db', () => ({
  HabitsDB: class {
    getUserHabits = mockGetUserHabits;
  },
}));

vi.mock('jszip', () => ({
  default: class {
    file = mockZipFile;
    generateAsync = mockGenerateAsync;
  },
}));

import { GET } from '@/app/api/export/route';

const mockHabits = [
  {
    id: 'habit-1',
    user_id: 'user-123',
    name: 'Morning Run',
    description: 'Run every morning',
    category_id: null,
    frequency: { type: 'daily' as const },
    status: 'active',
    current_streak: 5,
    best_streak: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

const mockLogs = [
  {
    id: 'log-1',
    habit_id: 'habit-1',
    user_id: 'user-123',
    logged_date: '2026-02-01',
    completed: true,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'log-2',
    habit_id: 'habit-1',
    user_id: 'user-123',
    logged_date: '2026-01-15',
    completed: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'log-3',
    habit_id: 'habit-1',
    user_id: 'user-123',
    logged_date: '2025-12-01',
    completed: true,
    created_at: '2025-12-01T00:00:00Z',
    updated_at: '2025-12-01T00:00:00Z',
  },
];

function createMockQuery(logs: typeof mockLogs) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: logs, error: null }),
  };
  return chain;
}

describe('GET /api/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockGetUserHabits.mockResolvedValue(mockHabits);
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost:3000/api/export?type=logs');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing type parameter', async () => {
    const req = new NextRequest('http://localhost:3000/api/export');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type parameter', async () => {
    const req = new NextRequest('http://localhost:3000/api/export?type=invalid');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('exports all logs when no date params provided', async () => {
    const query = createMockQuery(mockLogs);
    mockSupabaseFrom.mockReturnValue(query);

    const req = new NextRequest('http://localhost:3000/api/export?type=logs');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(query.gte).not.toHaveBeenCalled();
    expect(query.lte).not.toHaveBeenCalled();

    const csv = await res.text();
    expect(csv).toContain('habit_id,habit_name,logged_date,completed');
    expect(csv).toContain('Morning Run');
  });

  it('filters logs by startDate', async () => {
    const query = createMockQuery(mockLogs.slice(0, 2));
    mockSupabaseFrom.mockReturnValue(query);

    const req = new NextRequest('http://localhost:3000/api/export?type=logs&startDate=2026-01-01');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(query.gte).toHaveBeenCalledWith('logged_date', '2026-01-01');
    expect(query.lte).not.toHaveBeenCalled();
  });

  it('filters logs by endDate', async () => {
    const query = createMockQuery(mockLogs.slice(1));
    mockSupabaseFrom.mockReturnValue(query);

    const req = new NextRequest('http://localhost:3000/api/export?type=logs&endDate=2026-01-31');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(query.gte).not.toHaveBeenCalled();
    expect(query.lte).toHaveBeenCalledWith('logged_date', '2026-01-31');
  });

  it('filters logs by both startDate and endDate', async () => {
    const query = createMockQuery([mockLogs[1]]);
    mockSupabaseFrom.mockReturnValue(query);

    const req = new NextRequest('http://localhost:3000/api/export?type=logs&startDate=2026-01-01&endDate=2026-01-31');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(query.gte).toHaveBeenCalledWith('logged_date', '2026-01-01');
    expect(query.lte).toHaveBeenCalledWith('logged_date', '2026-01-31');
  });

  it('returns 400 for invalid startDate format', async () => {
    const req = new NextRequest('http://localhost:3000/api/export?type=logs&startDate=invalid');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('startDate');
  });

  it('returns 400 for invalid endDate format', async () => {
    const req = new NextRequest('http://localhost:3000/api/export?type=logs&endDate=02-01-2026');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('endDate');
  });

  it('returns 400 for semantically invalid date like 2026-13-45', async () => {
    const req = new NextRequest('http://localhost:3000/api/export?type=logs&startDate=2026-13-45');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('startDate');
  });

  it('exports habits without date filtering', async () => {
    const req = new NextRequest('http://localhost:3000/api/export?type=habits');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain('id,name,description');
    expect(csv).toContain('Morning Run');
  });

  describe('type=zip', () => {
    it('returns a ZIP with correct headers', async () => {
      const query = createMockQuery(mockLogs);
      mockSupabaseFrom.mockReturnValue(query);
      mockGenerateAsync.mockResolvedValue(Buffer.from('ZIPDATA'));

      const req = new NextRequest('http://localhost:3000/api/export?type=zip');
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/zip');
      expect(res.headers.get('Content-Disposition')).toMatch(
        /attachment; filename="betterrme-export-\d{4}-\d{2}-\d{2}\.zip"/
      );
    });

    it('bundles habits.csv and logs.csv into the ZIP', async () => {
      const query = createMockQuery(mockLogs);
      mockSupabaseFrom.mockReturnValue(query);
      mockGenerateAsync.mockResolvedValue(Buffer.from('ZIPDATA'));

      const req = new NextRequest('http://localhost:3000/api/export?type=zip');
      await GET(req);

      expect(mockZipFile).toHaveBeenCalledWith('habits.csv', expect.stringContaining('Morning Run'));
      expect(mockZipFile).toHaveBeenCalledWith('logs.csv', expect.stringContaining('Morning Run'));
    });

    it('returns a non-empty ZIP buffer', async () => {
      const query = createMockQuery(mockLogs);
      mockSupabaseFrom.mockReturnValue(query);
      mockGenerateAsync.mockResolvedValue(Buffer.from('ZIPDATA'));

      const req = new NextRequest('http://localhost:3000/api/export?type=zip');
      const res = await GET(req);

      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('filters logs by date range in ZIP export', async () => {
      const query = createMockQuery(mockLogs.slice(0, 1));
      mockSupabaseFrom.mockReturnValue(query);
      mockGenerateAsync.mockResolvedValue(Buffer.from('ZIPDATA'));

      const req = new NextRequest(
        'http://localhost:3000/api/export?type=zip&startDate=2026-02-01&endDate=2026-02-28'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      expect(query.gte).toHaveBeenCalledWith('logged_date', '2026-02-01');
      expect(query.lte).toHaveBeenCalledWith('logged_date', '2026-02-28');
    });

    it('returns 400 for invalid date params in ZIP export', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/export?type=zip&startDate=not-a-date'
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('startDate');
    });

    it('returns 500 when log query fails', async () => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
      };
      mockSupabaseFrom.mockReturnValue(query);

      const req = new NextRequest('http://localhost:3000/api/export?type=zip');
      const res = await GET(req);

      expect(res.status).toBe(500);
    });
  });
});
