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

const mockProfilesDB = {
  updatePreferences: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ProfilesDB: class {
    constructor() { return mockProfilesDB; }
  },
}));

describe('PATCH /api/profile/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
