import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetcher = vi.fn();
vi.mock('@/lib/fetcher', () => ({ fetcher }));

// Mock SWR to test hook behavior without actual network calls
const mockSWR = vi.fn();
vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockSWR(...args),
}));

describe('fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('returns JSON on successful response', async () => {
    const { fetcher: realFetcher } = await vi.importActual<{ fetcher: (url: string) => Promise<unknown> }>('@/lib/fetcher');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ habits: [] }),
    });

    const result = await realFetcher('/api/habits');
    expect(result).toEqual({ habits: [] });
    expect(global.fetch).toHaveBeenCalledWith('/api/habits');
  });

  it('throws error on failed response', async () => {
    const { fetcher: realFetcher } = await vi.importActual<{ fetcher: (url: string) => Promise<unknown> }>('@/lib/fetcher');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });

    await expect(realFetcher('/api/habits')).rejects.toThrow('Unauthorized');
  });

  it('throws generic error when no error message in response', async () => {
    const { fetcher: realFetcher } = await vi.importActual<{ fetcher: (url: string) => Promise<unknown> }>('@/lib/fetcher');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    await expect(realFetcher('/api/habits')).rejects.toThrow('Request failed');
  });
});

describe('useHabits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });
  });

  it('calls SWR with correct key for default filters', async () => {
    const { useHabits } = await import('@/lib/hooks/use-habits');
    useHabits();
    expect(mockSWR).toHaveBeenCalledWith('/api/habits?', fetcher);
  });

  it('includes status filter in SWR key', async () => {
    const { useHabits } = await import('@/lib/hooks/use-habits');
    useHabits({ status: 'active' });
    expect(mockSWR).toHaveBeenCalledWith(expect.stringContaining('status=active'), fetcher);
  });

  it('includes with_today filter in SWR key', async () => {
    const { useHabits } = await import('@/lib/hooks/use-habits');
    useHabits({ withToday: true });
    expect(mockSWR).toHaveBeenCalledWith(expect.stringContaining('with_today=true'), fetcher);
  });

  it('returns habits array from data', async () => {
    mockSWR.mockReturnValue({
      data: { habits: [{ id: '1', name: 'Test' }] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { useHabits } = await import('@/lib/hooks/use-habits');
    const result = useHabits();
    expect(result.habits).toEqual([{ id: '1', name: 'Test' }]);
    expect(result.isLoading).toBe(false);
  });

  it('returns empty array when no data', async () => {
    mockSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    const { useHabits } = await import('@/lib/hooks/use-habits');
    const result = useHabits();
    expect(result.habits).toEqual([]);
    expect(result.isLoading).toBe(true);
  });
});

describe('useHabit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });
  });

  it('calls SWR with habit ID key', async () => {
    const { useHabit } = await import('@/lib/hooks/use-habits');
    useHabit('habit-1');
    expect(mockSWR).toHaveBeenCalledWith('/api/habits/habit-1', fetcher);
  });

  it('passes null key when habitId is null (conditional fetch)', async () => {
    const { useHabit } = await import('@/lib/hooks/use-habits');
    useHabit(null);
    expect(mockSWR).toHaveBeenCalledWith(null, fetcher);
  });

  it('returns habit from data', async () => {
    mockSWR.mockReturnValue({
      data: { habit: { id: 'habit-1', name: 'Run' } },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { useHabit } = await import('@/lib/hooks/use-habits');
    const result = useHabit('habit-1');
    expect(result.habit).toEqual({ id: 'habit-1', name: 'Run' });
  });

  it('returns null when no data', async () => {
    const { useHabit } = await import('@/lib/hooks/use-habits');
    const result = useHabit('habit-1');
    expect(result.habit).toBeNull();
  });
});

describe('useHabitLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });
  });

  it('calls SWR with correct key and default 30 days', async () => {
    const { useHabitLogs } = await import('@/lib/hooks/use-habit-logs');
    useHabitLogs('habit-1');
    expect(mockSWR).toHaveBeenCalledWith('/api/habits/habit-1/logs?days=30', fetcher);
  });

  it('uses custom days parameter', async () => {
    const { useHabitLogs } = await import('@/lib/hooks/use-habit-logs');
    useHabitLogs('habit-1', 60);
    expect(mockSWR).toHaveBeenCalledWith('/api/habits/habit-1/logs?days=60', fetcher);
  });

  it('passes null key when habitId is null', async () => {
    const { useHabitLogs } = await import('@/lib/hooks/use-habit-logs');
    useHabitLogs(null);
    expect(mockSWR).toHaveBeenCalledWith(null, fetcher);
  });

  it('returns logs array from data', async () => {
    mockSWR.mockReturnValue({
      data: { logs: [{ id: 'log-1', completed: true }] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { useHabitLogs } = await import('@/lib/hooks/use-habit-logs');
    const result = useHabitLogs('habit-1');
    expect(result.logs).toEqual([{ id: 'log-1', completed: true }]);
  });

  it('returns empty array when no data', async () => {
    const { useHabitLogs } = await import('@/lib/hooks/use-habit-logs');
    const result = useHabitLogs('habit-1');
    expect(result.logs).toEqual([]);
  });
});

describe('useDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() });
  });

  it('calls SWR with dashboard key and no date', async () => {
    const { useDashboard } = await import('@/lib/hooks/use-dashboard');
    useDashboard();
    expect(mockSWR).toHaveBeenCalledWith('/api/dashboard', fetcher);
  });

  it('includes date parameter when provided', async () => {
    const { useDashboard } = await import('@/lib/hooks/use-dashboard');
    useDashboard('2026-02-04');
    expect(mockSWR).toHaveBeenCalledWith('/api/dashboard?date=2026-02-04', fetcher);
  });

  it('returns dashboard data', async () => {
    const dashboardData = { habits: [], tasks: [], stats: {} };
    mockSWR.mockReturnValue({
      data: dashboardData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { useDashboard } = await import('@/lib/hooks/use-dashboard');
    const result = useDashboard();
    expect(result.dashboard).toEqual(dashboardData);
  });

  it('returns null when no data', async () => {
    const { useDashboard } = await import('@/lib/hooks/use-dashboard');
    const result = useDashboard();
    expect(result.dashboard).toBeNull();
  });
});

describe('useHabitToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('calls toggle API with correct URL and method', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ completed: true, currentStreak: 5, bestStreak: 10 }),
    });

    const { useHabitToggle } = await import('@/lib/hooks/use-habit-toggle');
    const { toggleHabit } = useHabitToggle();
    await toggleHabit('habit-1');

    expect(global.fetch).toHaveBeenCalledWith('/api/habits/habit-1/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: undefined }),
    });
  });

  it('passes date to toggle API', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ completed: true, currentStreak: 1, bestStreak: 1 }),
    });

    const { useHabitToggle } = await import('@/lib/hooks/use-habit-toggle');
    const { toggleHabit } = useHabitToggle();
    await toggleHabit('habit-1', '2026-02-01');

    expect(global.fetch).toHaveBeenCalledWith('/api/habits/habit-1/toggle', expect.objectContaining({
      body: JSON.stringify({ date: '2026-02-01' }),
    }));
  });

  it('calls onOptimisticUpdate before API call', async () => {
    const onOptimisticUpdate = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ completed: true, currentStreak: 1, bestStreak: 1 }),
    });

    const { useHabitToggle } = await import('@/lib/hooks/use-habit-toggle');
    const { toggleHabit } = useHabitToggle();
    await toggleHabit('habit-1', undefined, { onOptimisticUpdate });

    expect(onOptimisticUpdate).toHaveBeenCalled();
  });

  it('calls onSuccess with data after successful toggle', async () => {
    const onSuccess = vi.fn();
    const responseData = { completed: true, currentStreak: 5, bestStreak: 10 };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const { useHabitToggle } = await import('@/lib/hooks/use-habit-toggle');
    const { toggleHabit } = useHabitToggle();
    await toggleHabit('habit-1', undefined, { onSuccess });

    expect(onSuccess).toHaveBeenCalledWith(responseData);
  });

  it('calls onError and throws on API failure', async () => {
    const onError = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'EDIT_WINDOW_EXCEEDED' }),
    });

    const { useHabitToggle } = await import('@/lib/hooks/use-habit-toggle');
    const { toggleHabit } = useHabitToggle();

    await expect(toggleHabit('habit-1', undefined, { onError })).rejects.toThrow('EDIT_WINDOW_EXCEEDED');
    expect(onError).toHaveBeenCalled();
  });

  it('returns toggle response data', async () => {
    const responseData = { completed: false, currentStreak: 0, bestStreak: 10 };
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(responseData),
    });

    const { useHabitToggle } = await import('@/lib/hooks/use-habit-toggle');
    const { toggleHabit } = useHabitToggle();
    const result = await toggleHabit('habit-1');

    expect(result).toEqual(responseData);
  });
});
