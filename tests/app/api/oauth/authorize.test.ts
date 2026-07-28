import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { mockSupabaseClient } from '../../../setup';

const {
  mockGetUser,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  return { mockGetUser };
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
vi.mock('@supabase/supabase-js', async () => {
  const { mockSupabaseClient: client } = await import('../../../setup');
  return { createClient: () => client };
});

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
const NOW = new Date('2026-07-28T20:00:00.000Z');

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
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockSupabaseClient.setMockResponse(null, null);
  });

  afterEach(() => vi.useRealTimers());

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

  it('ignores requested scopes and issues the established read/write scopes', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const response = await GET(makeRequest({ scope: 'read admin' }));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    const codeHash = crypto
      .createHash('sha256')
      .update(location.searchParams.get('code')!)
      .digest('hex');
    expect(mockSupabaseClient.queryLog).toEqual(expectedQueries(codeHash));
  });

  it('keeps the issued scope fixed when a client requests a supported subset', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const response = await GET(makeRequest({ scope: 'read' }));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    const codeHash = crypto
      .createHash('sha256')
      .update(location.searchParams.get('code')!)
      .digest('hex');
    expect(mockSupabaseClient.queryLog).toEqual(expectedQueries(codeHash));
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

    const codeHash = crypto
      .createHash('sha256')
      .update(location.searchParams.get('code')!)
      .digest('hex');
    expect(mockSupabaseClient.queryLog).toEqual(expectedQueries(codeHash));
  });
});

function expectedQueries(codeHash: string) {
  return [
    { table: 'oauth_codes', method: 'from', args: ['oauth_codes'] },
    { table: 'oauth_codes', method: 'delete', args: [] },
    { table: 'oauth_codes', method: 'lt', args: ['expires_at', NOW.toISOString()] },
    { table: 'oauth_codes', method: 'from', args: ['oauth_codes'] },
    {
      table: 'oauth_codes',
      method: 'insert',
      args: [{
        code_hash: codeHash,
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        user_id: 'user-123',
        scopes: ['read', 'write'],
        expires_at: '2026-07-28T20:05:00.000Z',
        code_challenge: 'abc123challenge',
        code_challenge_method: 'S256',
        used: false,
      }],
    },
  ];
}
