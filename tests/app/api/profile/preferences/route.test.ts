import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '@/app/api/profile/preferences/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })),
    },
  })),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockProfilesDB = {
  updatePreferences: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ProfilesDB: class {
    constructor() { return mockProfilesDB; }
  },
}));

import { createClient } from '@/lib/supabase/server';

describe('PATCH /api/profile/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should update preferences', async () => {
    const updatedProfile = {
      id: 'user-123',
      preferences: {
        theme: 'dark',
        date_format: 'MM/DD/YYYY',
        week_start_day: 1,
      },
    };
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toEqual(updatedProfile);
    expect(mockProfilesDB.updatePreferences).toHaveBeenCalledWith('user-123', {
      theme: 'dark',
    });
  });

  it('should accept quiet hours as a partial preference intent', async () => {
    const updatedProfile = {
      id: 'user-123',
      preferences: {
        theme: 'system',
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
      },
    };
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({
        quiet_hours_start: '22:00',
        quiet_hours_end: '07:00',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toEqual(updatedProfile);
    expect(mockProfilesDB.updatePreferences).toHaveBeenCalledWith('user-123', {
      quiet_hours_start: '22:00',
      quiet_hours_end: '07:00',
    });
  });

  it('should validate theme', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'invalid' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Validation failed');
  });

  it('should validate week_start_day', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ week_start_day: 10 }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 if no valid updates', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('should return 400 if body is not an object', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify('invalid'),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });

  it('should return 401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 404 when profile not found', async () => {
    vi.mocked(mockProfilesDB.updatePreferences).mockRejectedValue(
      new Error('Profile not found for user user-123')
    );

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Profile not found');
  });

  it('should return 500 on unexpected DB error', async () => {
    vi.mocked(mockProfilesDB.updatePreferences).mockRejectedValue(
      new Error('connection lost')
    );

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to update preferences');
  });

  it('should return 500 when error is a non-Error object', async () => {
    vi.mocked(mockProfilesDB.updatePreferences).mockRejectedValue('string error');

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(500);
  });

  it('should validate weight_unit', async () => {
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue({ id: 'user-123' } as any);

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ weight_unit: 'stones' }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });
});
