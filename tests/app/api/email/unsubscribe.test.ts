import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Hoist mock functions
const { mockVerifyToken, mockUpdatePreferences } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockUpdatePreferences: vi.fn(),
}));

// Mock unsubscribe module
vi.mock('@/lib/email/unsubscribe', () => ({
  verifyUnsubscribeToken: mockVerifyToken,
}));

// Mock admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

// Mock profiles DB
vi.mock('@/lib/db', () => ({
  ProfilesDB: class {
    updatePreferences = mockUpdatePreferences;
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from '@/app/api/email/unsubscribe/route';

describe('GET /api/email/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when no token is provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/email/unsubscribe');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain('Invalid Link');
  });

  it('returns 400 when token is invalid', async () => {
    mockVerifyToken.mockReturnValue(null);

    const request = new NextRequest('http://localhost:3000/api/email/unsubscribe?token=bad-token');
    const response = await GET(request);

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toContain('Invalid Link');
    expect(text).toContain('invalid or has expired');
  });

  it('returns 200 and disables email notifications with valid token', async () => {
    mockVerifyToken.mockReturnValue('user-123');
    mockUpdatePreferences.mockResolvedValue({});

    const request = new NextRequest('http://localhost:3000/api/email/unsubscribe?token=valid-token');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Unsubscribed');
    expect(text).toContain('re-enable them in your settings');
    expect(mockUpdatePreferences).toHaveBeenCalledWith('user-123', {
      email_notifications_enabled: false,
    });
  });

  it('returns 500 when updatePreferences throws', async () => {
    mockVerifyToken.mockReturnValue('user-123');
    mockUpdatePreferences.mockRejectedValue(new Error('DB error'));

    const request = new NextRequest('http://localhost:3000/api/email/unsubscribe?token=valid-token');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain('Error');
    expect(text).toContain('Something went wrong');
  });
});
