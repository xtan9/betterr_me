import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { graduateMock, reactivateMock, dismissMock } = vi.hoisted(() => ({
  graduateMock: vi.fn(),
  reactivateMock: vi.fn(),
  dismissMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } } })),
    },
  })),
}));

vi.mock('@/lib/db', () => {
  class HabitNotFoundError extends Error {
    constructor(habitId: string) {
      super(`Habit not found: ${habitId}`);
      this.name = 'HabitNotFoundError';
    }
  }
  class HabitNotFormedError extends Error {
    constructor(habitId: string) {
      super(`Habit is not formed: ${habitId}`);
      this.name = 'HabitNotFormedError';
    }
  }
  class HabitAlreadyFormedError extends Error {
    constructor(habitId: string) {
      super(`Habit is already formed: ${habitId}`);
      this.name = 'HabitAlreadyFormedError';
    }
  }
  return {
    HabitsDB: class {
      graduateHabit = graduateMock;
      reactivateHabit = reactivateMock;
      dismissGraduationNudge = dismissMock;
    },
    HabitNotFoundError,
    HabitNotFormedError,
    HabitAlreadyFormedError,
  };
});

import { POST as graduatePOST } from '@/app/api/habits/[id]/graduate/route';
import { POST as reactivatePOST } from '@/app/api/habits/[id]/reactivate/route';
import { POST as dismissPOST } from '@/app/api/habits/[id]/dismiss-graduation-nudge/route';
import { createClient } from '@/lib/supabase/server';
import {
  HabitNotFoundError,
  HabitNotFormedError,
  HabitAlreadyFormedError,
} from '@/lib/db';

const params = Promise.resolve({ id: 'h1' });

describe('POST /api/habits/[id]/graduate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } } })) },
    } as any);
  });

  it('returns the graduated habit', async () => {
    graduateMock.mockResolvedValue({ id: 'h1', status: 'formed' });
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ habit: { id: 'h1', status: 'formed' } });
    expect(graduateMock).toHaveBeenCalledWith('h1', 'user-1');
  });

  it('returns 404 when habit not found', async () => {
    graduateMock.mockRejectedValue(new HabitNotFoundError('h1'));
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when habit is already formed', async () => {
    graduateMock.mockRejectedValue(new HabitAlreadyFormedError('h1'));
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/habits/[id]/reactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } } })) },
    } as any);
  });

  it('returns the reactivated habit', async () => {
    reactivateMock.mockResolvedValue({ id: 'h1', status: 'active', current_streak: 0 });
    const res = await reactivatePOST(
      new NextRequest('http://localhost/api/habits/h1/reactivate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.habit.status).toBe('active');
  });

  it('returns 400 when habit is not formed', async () => {
    reactivateMock.mockRejectedValue(new HabitNotFormedError('h1'));
    const res = await reactivatePOST(
      new NextRequest('http://localhost/api/habits/h1/reactivate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/habits/[id]/dismiss-graduation-nudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } } })) },
    } as any);
  });

  it('stamps the dismissal', async () => {
    dismissMock.mockResolvedValue({ id: 'h1', nudge_dismissed_at: '2026-04-12T00:00:00Z' });
    const res = await dismissPOST(
      new NextRequest('http://localhost/api/habits/h1/dismiss-graduation-nudge', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(dismissMock).toHaveBeenCalledWith('h1', 'user-1');
  });
});
