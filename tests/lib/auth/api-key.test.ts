// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env vars before importing the module under test
process.env.API_KEY_HMAC_SECRET = 'test-secret-key-for-hmac-testing-purposes';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock @/lib/logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock Supabase server client (cookie auth path)
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js createClient (service role / API key path)
// ---------------------------------------------------------------------------
const mockServiceSelect = vi.fn();
const mockServiceEq = vi.fn();
const mockServiceSingle = vi.fn();
const mockServiceUpdate = vi.fn();
const mockServiceFrom = vi.fn();

function setupServiceChain() {
  mockServiceFrom.mockReturnValue({
    select: mockServiceSelect,
    update: mockServiceUpdate,
  });
  mockServiceSelect.mockReturnValue({ eq: mockServiceEq });
  mockServiceEq.mockReturnValue({ single: mockServiceSingle });
  // update chain for last_used_at fire-and-forget
  mockServiceUpdate.mockReturnValue({
    eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
  });
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

import {
  generateApiKey,
  hashApiKey,
  authenticateRequest,
} from '@/lib/auth/api-key';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// generateApiKey
// ---------------------------------------------------------------------------
describe('generateApiKey', () => {
  it('returns an object with fullKey, keyPrefix, keyHash', () => {
    const result = generateApiKey();
    expect(result).toHaveProperty('fullKey');
    expect(result).toHaveProperty('keyPrefix');
    expect(result).toHaveProperty('keyHash');
  });

  it('fullKey starts with "brm_" and is 36 chars long', () => {
    const { fullKey } = generateApiKey();
    expect(fullKey.startsWith('brm_')).toBe(true);
    // brm_ (4) + 16 bytes hex (32) = 36
    expect(fullKey.length).toBe(36);
  });

  it('keyPrefix is first 12 chars of fullKey', () => {
    const { fullKey, keyPrefix } = generateApiKey();
    expect(keyPrefix).toBe(fullKey.slice(0, 12));
  });

  it('keyHash is a 64-char hex string (SHA-256)', () => {
    const { keyHash } = generateApiKey();
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('each call generates a unique key', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.fullKey).not.toBe(b.fullKey);
    expect(a.keyHash).not.toBe(b.keyHash);
  });
});

// ---------------------------------------------------------------------------
// hashApiKey
// ---------------------------------------------------------------------------
describe('hashApiKey', () => {
  it('returns consistent hash for same input', () => {
    const h1 = hashApiKey('brm_test123');
    const h2 = hashApiKey('brm_test123');
    expect(h1).toBe(h2);
  });

  it('returns different hash for different input', () => {
    const h1 = hashApiKey('brm_aaa');
    const h2 = hashApiKey('brm_bbb');
    expect(h1).not.toBe(h2);
  });

  it('returns a 64-char hex string', () => {
    const hash = hashApiKey('brm_anything');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// authenticateRequest
// ---------------------------------------------------------------------------
describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupServiceChain();
  });

  it('returns AuthError with status 401 when no auth header and no cookie session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const result = await authenticateRequest(request);

    expect(result).toEqual({ error: 'Unauthorized', status: 401 });
  });

  it('returns AuthResult when valid cookie session exists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const result = await authenticateRequest(request);

    expect(result).toHaveProperty('userId', 'user-123');
    expect(result).toHaveProperty('permissions', 'read_write');
    expect(result).toHaveProperty('supabase');
  });

  it('cookie auth returns permissions "read_write"', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-456' } },
    });

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const result = await authenticateRequest(request);

    expect('permissions' in result && result.permissions).toBe('read_write');
  });

  it('returns AuthResult for valid API key', async () => {
    const { fullKey } = generateApiKey();

    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'user-789',
        permissions: 'read_write',
        expires_at: null,
      },
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      headers: { authorization: `Bearer ${fullKey}` },
    });

    const result = await authenticateRequest(request);

    expect(result).toHaveProperty('userId', 'user-789');
    expect(result).toHaveProperty('permissions', 'read_write');
    expect(result).toHaveProperty('supabase');
  });

  it('returns 401 for invalid API key (not found in DB)', async () => {
    mockServiceSingle.mockResolvedValue({ data: null, error: null });

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      headers: { authorization: 'Bearer brm_invalidkey1234567890abcdef' },
    });

    const result = await authenticateRequest(request);

    expect(result).toEqual({ error: 'Invalid API key', status: 401 });
  });

  it('returns 500 when API key DB lookup fails', async () => {
    mockServiceSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'DB error' } });

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      headers: { authorization: 'Bearer brm_invalidkey1234567890abcdef' },
    });

    const result = await authenticateRequest(request);

    expect(result).toEqual({ error: 'Internal server error', status: 500 });
  });

  it('returns 401 for expired API key', async () => {
    const { fullKey } = generateApiKey();

    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'user-789',
        permissions: 'read_write',
        expires_at: '2020-01-01T00:00:00Z', // expired
      },
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      headers: { authorization: `Bearer ${fullKey}` },
    });

    const result = await authenticateRequest(request);

    expect(result).toEqual({ error: 'API key has expired', status: 401 });
  });

  it('returns 403 for read-only key on write method', async () => {
    const { fullKey } = generateApiKey();

    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'user-789',
        permissions: 'read',
        expires_at: null,
      },
      error: null,
    });

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      headers: { authorization: `Bearer ${fullKey}` },
    });

    const result = await authenticateRequest(request);

    expect(result).toEqual({
      error: 'API key does not have write permission',
      status: 403,
    });
  });
});
