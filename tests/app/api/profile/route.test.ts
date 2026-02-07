import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '@/app/api/profile/route';
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
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  ProfilesDB: class {
    constructor() { return mockProfilesDB; }
  },
}));

import { createClient } from '@/lib/supabase/server';

describe('GET /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user profile', async () => {
    const mockProfile = {
      id: 'user-123',
      email: 'test@example.com',
      full_name: 'Test User',
      preferences: { theme: 'dark' },
    };
    vi.mocked(mockProfilesDB.getProfile).mockResolvedValue(mockProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toEqual(mockProfile);
    expect(mockProfilesDB.getProfile).toHaveBeenCalledWith('user-123');
  });

  it('should return 404 if profile not found', async () => {
    vi.mocked(mockProfilesDB.getProfile).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/profile');
    const response = await GET(request);

    expect(response.status).toBe(404);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/profile');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
  });

  it('should update profile', async () => {
    const updatedProfile = {
      id: 'user-123',
      full_name: 'Updated Name',
      avatar_url: 'https://example.com/avatar.jpg',
    };
    vi.mocked(mockProfilesDB.updateProfile).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        full_name: 'Updated Name',
        avatar_url: 'https://example.com/avatar.jpg',
      }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toEqual(updatedProfile);
  });

  it('should return 400 if no valid updates', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
  });
});
