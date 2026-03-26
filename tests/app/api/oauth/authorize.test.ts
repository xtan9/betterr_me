import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUser,
  mockInsert,
  mockServiceFrom,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockDeleteLt = vi.fn().mockResolvedValue({ error: null });
  const mockServiceFrom = vi.fn().mockImplementation(() => ({
    insert: mockInsert,
    delete: () => ({ lt: mockDeleteLt }),
  }));
  return { mockGetUser, mockInsert, mockServiceFrom };
});

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock Supabase server client (cookie-based auth)
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

// Mock Supabase service client (for DB operations)
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockServiceFrom }),
}));

import { GET } from '@/app/api/oauth/authorize/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUrl(params: Record<string, string>): string {
  const url = new URL('http://localhost:3000/api/oauth/authorize');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

const VALID_PARAMS = {
  client_id: 'test-client',
  redirect_uri: 'http://localhost:3000/callback',
  response_type: 'code',
  state: 'random-state',
  code_challenge: 'abc123challenge',
  code_challenge_method: 'S256',
};

function omit<T extends Record<string, unknown>>(obj: T, ...keys: string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !keys.includes(k)),
  ) as Record<string, string>;
}

function makeRequest(overrides: Record<string, string> = {}): NextRequest {
  const params = { ...VALID_PARAMS, ...overrides };
  return new NextRequest(makeUrl(params));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/oauth/authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('returns 400 if client_id is missing', async () => {
    const request = new NextRequest(makeUrl(omit(VALID_PARAMS, 'client_id')));
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('client_id');
  });

  it('returns 400 if redirect_uri is missing', async () => {
    const request = new NextRequest(makeUrl(omit(VALID_PARAMS, 'redirect_uri')));
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('redirect_uri');
  });

  it('returns 400 if redirect_uri is not localhost', async () => {
    const request = makeRequest({ redirect_uri: 'https://evil.com/callback' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('redirect_uri');
  });

  it('returns 400 if response_type is not "code"', async () => {
    const request = makeRequest({ response_type: 'token' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('response_type');
  });

  it('returns 400 if state is missing', async () => {
    const request = new NextRequest(makeUrl(omit(VALID_PARAMS, 'state')));
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('state');
  });

  it('returns 400 if code_challenge is missing', async () => {
    const request = new NextRequest(makeUrl(omit(VALID_PARAMS, 'code_challenge')));
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('code_challenge');
  });

  it('returns 400 if code_challenge_method is not S256', async () => {
    const request = makeRequest({ code_challenge_method: 'plain' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('code_challenge_method');
  });

  it('redirects to /auth/login if no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(302);
    const location = response.headers.get('location')!;
    expect(location).toContain('/auth/login');
    expect(location).toContain('returnTo');
  });

  it('redirects to redirect_uri with code and state when authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe('http://localhost:3000');
    expect(location.pathname).toBe('/callback');
    expect(location.searchParams.get('code')).toBeTruthy();
    expect(location.searchParams.get('state')).toBe('random-state');

    // Verify insert was called
    expect(mockInsert).toHaveBeenCalled();
  });
});
