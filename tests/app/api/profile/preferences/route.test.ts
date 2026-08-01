import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from '@/app/api/profile/preferences/route';
import { NextRequest } from 'next/server';

const { mockAuthenticateRequest, mockLegacyInfo } = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockLegacyInfo: vi.fn(),
}));

vi.mock('@/lib/auth/authenticated-request', () => ({
  authenticateRequest: mockAuthenticateRequest,
  cookieRouteErrorMessage: (error: { error: string; status: number }) =>
    error.status === 401 ? 'Unauthorized' : error.error,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: mockLegacyInfo },
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
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      principal: { type: 'user', userId: 'user-123', credential: 'cookie' },
      client: {},
    });
  });

  it('declares cookie write policy and consumes the shared request context', async () => {
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue({
      id: 'user-123',
      preferences: { theme: 'dark' },
    } as any);
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(mockAuthenticateRequest).toHaveBeenCalledWith(request, {
      allowedCredentials: ['cookie'],
      requiredPermission: 'write',
    });
    expect(mockLegacyInfo).toHaveBeenCalledWith(
      '[legacy] deprecated route',
      expect.objectContaining({
        route: '/api/profile/preferences',
        domain: 'preferences',
      }),
    );
    const telemetry = mockLegacyInfo.mock.calls.at(-1)?.[1];
    expect(Object.keys(telemetry).sort()).toEqual([
      'correlationId',
      'domain',
      'route',
    ]);
    expect(JSON.stringify(telemetry)).not.toContain('user-123');
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

  it('should accept email notifications as a partial preference intent', async () => {
    const updatedProfile = {
      id: 'user-123',
      preferences: {
        theme: 'system',
        email_notifications_enabled: true,
      },
    };
    vi.mocked(mockProfilesDB.updatePreferences).mockResolvedValue(updatedProfile as any);

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ email_notifications_enabled: true }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(mockProfilesDB.updatePreferences).toHaveBeenCalledWith('user-123', {
      email_notifications_enabled: true,
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

  it.each([2, 6, 10])('should accept only Sunday or Monday for week_start_day (%s)', async (weekStartDay) => {
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ week_start_day: weekStartDay }),
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
    mockAuthenticateRequest.mockResolvedValueOnce({
      ok: false,
      error: 'Unauthorized',
      status: 401,
    });

    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('preserves the unauthorized contract for an invalid cookie', async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({
      ok: false,
      outcome: 'invalid',
      error: 'Invalid credentials',
      status: 401,
    });
    const request = new NextRequest('http://localhost:3000/api/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'dark' }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mockProfilesDB.updatePreferences).not.toHaveBeenCalled();
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
    expect(mockLegacyInfo).toHaveBeenCalledWith(
      '[legacy] deprecated route',
      expect.objectContaining({
        route: '/api/profile/preferences',
        domain: 'preferences',
        errorCode: 'preference_write_failed',
      }),
    );
    expect(JSON.stringify(mockLegacyInfo.mock.calls)).not.toContain('connection lost');
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
