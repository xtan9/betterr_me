import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '@/app/api/profile/route';
import { NextRequest } from 'next/server';

const { mockLegacyInfo } = vi.hoisted(() => ({
  mockLegacyInfo: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: mockLegacyInfo },
}));

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
  updatePreferences: vi.fn(),
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
      preference_revision: 2,
    };
    vi.mocked(mockProfilesDB.getProfile).mockResolvedValue(mockProfile as any);

    const response = await GET(new NextRequest('http://localhost/api/profile'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.profile).toEqual(mockProfile);
    expect(mockProfilesDB.getProfile).toHaveBeenCalledWith('user-123');
    expect(mockLegacyInfo).toHaveBeenCalledWith(
      '[legacy] deprecated route',
      expect.objectContaining({
        route: '/api/profile',
        domain: 'profile',
        revision: 2,
      }),
    );
    const telemetry = mockLegacyInfo.mock.calls.at(-1)?.[1];
    expect(Object.keys(telemetry).sort()).toEqual([
      'correlationId',
      'domain',
      'revision',
      'route',
    ]);
    expect(telemetry.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(JSON.stringify(telemetry)).not.toContain('user-123');
  });

  it('should return 404 if profile not found', async () => {
    vi.mocked(mockProfilesDB.getProfile).mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/profile'));

    expect(response.status).toBe(404);
  });

  it('should return 401 if not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const response = await GET(new NextRequest('http://localhost/api/profile'));

    expect(response.status).toBe(401);
  });

  it('should return 500 when getProfile throws', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: { id: 'user-123' } } })) },
    } as any);
    vi.mocked(mockProfilesDB.getProfile).mockRejectedValue(new Error('db error'));

    const response = await GET(new NextRequest('http://localhost/api/profile'));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch profile');
    expect(mockLegacyInfo).toHaveBeenCalledWith(
      '[legacy] deprecated route',
      expect.objectContaining({
        route: '/api/profile',
        domain: 'profile',
        errorCode: 'profile_read_failed',
      }),
    );
    expect(JSON.stringify(mockLegacyInfo.mock.calls)).not.toContain('db error');
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

  it('should persist timezone string to profile', async () => {
    const updatedProfile = { id: 'user-123', timezone: 'America/New_York' };
    vi.mocked(mockProfilesDB.updateProfile).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: 'America/New_York' }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(mockProfilesDB.updateProfile).toHaveBeenCalledWith('user-123', {
      timezone: 'America/New_York',
    });
  });

  it('should persist timezone null to profile', async () => {
    const updatedProfile = { id: 'user-123', timezone: null };
    vi.mocked(mockProfilesDB.updateProfile).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ timezone: null }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    expect(mockProfilesDB.updateProfile).toHaveBeenCalledWith('user-123', {
      timezone: null,
    });
  });

  it('should not include timezone in updates when not provided', async () => {
    const updatedProfile = { id: 'user-123', full_name: 'Test' };
    vi.mocked(mockProfilesDB.updateProfile).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'Test' }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    const updateArg = mockProfilesDB.updateProfile.mock.calls[0][1];
    expect(updateArg).not.toHaveProperty('timezone');
  });

  it('should return 401 when not authenticated', async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null } })) },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'A' }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(401);
  });

  it('should reject legacy preference persistence fields', async () => {
    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        preferences: { theme: 'dark' },
        email_notifications_enabled: true,
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    expect(mockProfilesDB.updateProfile).not.toHaveBeenCalled();
    expect(mockProfilesDB.updatePreferences).not.toHaveBeenCalled();
  });

  it('should coerce empty full_name to null', async () => {
    vi.mocked(mockProfilesDB.updateProfile).mockResolvedValue({ id: 'user-123' } as any);

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ full_name: '   ' }),
    });

    await PATCH(request);
    expect(mockProfilesDB.updateProfile).toHaveBeenCalledWith('user-123', {
      full_name: null,
    });
  });

  it('should return 404 when profile not found on update', async () => {
    vi.mocked(mockProfilesDB.updateProfile).mockRejectedValue(
      new Error('Profile not found for user')
    );

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'Test' }),
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toBe('Profile not found');
  });

  it('should return 500 on unexpected update error', async () => {
    vi.mocked(mockProfilesDB.updateProfile).mockRejectedValue(
      new Error('connection lost')
    );

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'Test' }),
    });

    const response = await PATCH(request);
    const data = await response.json();
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to update profile');
  });

  it('should return 500 on non-Error throw', async () => {
    vi.mocked(mockProfilesDB.updateProfile).mockRejectedValue('string error');

    const request = new NextRequest('http://localhost:3000/api/profile', {
      method: 'PATCH',
      body: JSON.stringify({ full_name: 'Test' }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(500);
  });
});
