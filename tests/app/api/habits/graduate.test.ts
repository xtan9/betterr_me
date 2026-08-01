import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  graduateMock,
  reactivateMock,
  dismissMock,
  toHabitResponseMock,
} = vi.hoisted(() => ({
  graduateMock: vi.fn(),
  reactivateMock: vi.fn(),
  dismissMock: vi.fn(),
  toHabitResponseMock: vi.fn(),
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
      reactivateHabit = reactivateMock;
      dismissGraduationNudge = dismissMock;
    },
    HabitNotFoundError,
    HabitNotFormedError,
    HabitAlreadyFormedError,
  };
});

vi.mock('@/lib/habits/writes', () => ({
  createHabitWrites: vi.fn(() => ({ graduate: graduateMock })),
  toHabitResponse: toHabitResponseMock,
}));

import { POST as graduatePOST } from '@/app/api/habits/[id]/graduate/route';
import { POST as reactivatePOST } from '@/app/api/habits/[id]/reactivate/route';
import { POST as dismissPOST } from '@/app/api/habits/[id]/dismiss-graduation-nudge/route';
import { createClient } from '@/lib/supabase/server';
import { HabitNotFormedError } from '@/lib/db';

const params = Promise.resolve({ id: 'h1' });

describe('POST /api/habits/[id]/graduate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-1' } } })) },
    } as any);
  });

  it('returns the graduated habit', async () => {
    const habit = { id: 'h1', status: 'formed' };
    const presentedHabit = { id: 'h1', status: 'formed', graduated_at: 'now' };
    graduateMock.mockResolvedValue({ type: 'graduated', habit });
    toHabitResponseMock.mockReturnValue(presentedHabit);
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ habit: presentedHabit });
    expect(graduateMock).toHaveBeenCalledWith({ habitId: 'h1', userId: 'user-1' });
    expect(toHabitResponseMock).toHaveBeenCalledWith(habit);
  });

  it('returns 404 when habit not found', async () => {
    graduateMock.mockResolvedValue({ type: 'not-found' });
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Habit not found' });
  });

  it('returns 400 when habit is already formed', async () => {
    graduateMock.mockResolvedValue({
      type: 'already-formed',
      habit: { id: 'h1', status: 'formed' },
    });
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Habit is already formed' });
  });

  it('returns 409 for an invalid transition', async () => {
    graduateMock.mockResolvedValue({
      type: 'invalid-transition',
      action: 'graduate',
      currentStatus: 'paused',
      message: 'Habit cannot be graduated from paused state',
    });
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Habit cannot be graduated from paused state',
    });
  });

  it('returns 500 for an unexpected graduation failure', async () => {
    graduateMock.mockRejectedValue(new Error('rpc unavailable'));
    const res = await graduatePOST(
      new NextRequest('http://localhost/api/habits/h1/graduate', { method: 'POST' }),
      { params }
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to graduate habit' });
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
