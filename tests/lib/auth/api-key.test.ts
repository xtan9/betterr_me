// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogError } = vi.hoisted(() => ({
  mockLogError: vi.fn(),
}));

// Set env vars before importing the module under test
process.env.API_KEY_HMAC_SECRET = 'test-secret-key-for-hmac-testing-purposes';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock @/lib/logger
vi.mock('@/lib/logger', () => ({
  log: { error: mockLogError, warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock Supabase server client (cookie auth path)
// ---------------------------------------------------------------------------
const mockGetUser = vi.fn();
const mockCookieClient = {
  auth: { getUser: mockGetUser },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockCookieClient),
}));

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js createClient (service role / API key path)
// ---------------------------------------------------------------------------
const mockServiceSelect = vi.fn();
const mockServiceEq = vi.fn();
const mockServiceSingle = vi.fn();
const mockServiceUpdate = vi.fn();
const mockServiceUpdateEq = vi.fn();
const mockServiceFrom = vi.fn();
const mockServiceClient = {
  from: mockServiceFrom,
};
const serviceQueryLog: Array<{
  table: string;
  method: string;
  args: unknown[];
}> = [];

function setupServiceChain() {
  let table = '';
  mockServiceFrom.mockImplementation((nextTable: string) => {
    table = nextTable;
    serviceQueryLog.push({ table, method: 'from', args: [nextTable] });
    return {
      select: mockServiceSelect,
      update: mockServiceUpdate,
    };
  });
  mockServiceSelect.mockImplementation((...args: unknown[]) => {
    serviceQueryLog.push({ table, method: 'select', args });
    return { eq: mockServiceEq };
  });
  mockServiceEq.mockImplementation((...args: unknown[]) => {
    serviceQueryLog.push({ table, method: 'eq', args });
    return {
      maybeSingle: (...singleArgs: unknown[]) => {
        serviceQueryLog.push({
          table,
          method: 'maybeSingle',
          args: singleArgs,
        });
        return mockServiceSingle(...singleArgs);
      },
    };
  });
  mockServiceUpdate.mockImplementation((...args: unknown[]) => {
    serviceQueryLog.push({ table, method: 'update', args });
    return {
      eq: (...eqArgs: unknown[]) => {
        serviceQueryLog.push({ table, method: 'eq', args: eqArgs });
        return mockServiceUpdateEq(...eqArgs);
      },
    };
  });
  mockServiceUpdateEq.mockResolvedValue({ error: null });
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockServiceClient),
}));

import {
  generateApiKey,
  hashApiKey,
} from '@/lib/auth/api-key';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import type { AuthenticatedRequestPolicy } from '@/lib/auth/request-context';
import { NextRequest } from 'next/server';

const USER_API_READ_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'read',
} as const satisfies AuthenticatedRequestPolicy;

const USER_API_WRITE_POLICY = {
  allowedCredentials: ['apiKey', 'cookie'],
  requiredPermission: 'write',
} as const satisfies AuthenticatedRequestPolicy;

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
    serviceQueryLog.length = 0;
    setupServiceChain();
  });

  it('returns AuthError with status 401 when no auth header and no cookie session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const result = await authenticateRequest(request, USER_API_READ_POLICY);

    expect(result).toEqual({
      ok: false,
      outcome: 'anonymous',
      error: 'Unauthorized',
      status: 401,
    });
  });

  it('returns AuthResult when valid cookie session exists', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const result = await authenticateRequest(request, USER_API_READ_POLICY);

    expect(result).toEqual({
      ok: true,
      outcome: 'authenticated',
      principal: { userId: 'user-123', credential: 'cookie' },
      permissions: ['read', 'write'],
      permission: 'read',
      client: mockCookieClient,
    });
  });

  it('cookie auth returns permissions "read_write"', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-456' } },
    });

    const request = new NextRequest('http://localhost:3000/api/tasks');
    const result = await authenticateRequest(request, USER_API_READ_POLICY);

    expect('permissions' in result && result.permissions).toEqual(['read', 'write']);
  });

  it('returns AuthResult for valid API key', async () => {
    const { fullKey, keyHash } = generateApiKey();

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

    const result = await authenticateRequest(request, USER_API_READ_POLICY);

    expect(result).toEqual({
      ok: true,
      outcome: 'authenticated',
      principal: { userId: 'user-789', credential: 'apiKey' },
      permissions: ['read', 'write'],
      permission: 'read',
      client: mockServiceClient,
    });
    expect(serviceQueryLog).toEqual([
      { table: 'api_keys', method: 'from', args: ['api_keys'] },
      {
        table: 'api_keys',
        method: 'select',
        args: ['id, user_id, permissions, expires_at'],
      },
      {
        table: 'api_keys',
        method: 'eq',
        args: ['key_hash', keyHash],
      },
      { table: 'api_keys', method: 'maybeSingle', args: [] },
      { table: 'api_keys', method: 'from', args: ['api_keys'] },
      {
        table: 'api_keys',
        method: 'update',
        args: [
          {
            last_used_at: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
            ),
          },
        ],
      },
      { table: 'api_keys', method: 'eq', args: ['id', 'key-1'] },
    ]);
  });

  it('uses a valid API key instead of a valid cookie when both are present', async () => {
    const { fullKey } = generateApiKey();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'cookie-user' } },
      error: null,
    });
    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'api-key-user',
        permissions: 'read_write',
        expires_at: null,
      },
      error: null,
    });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/tasks', {
        headers: {
          authorization: `Bearer ${fullKey}`,
          cookie: 'session=valid-cookie',
        },
      }),
      USER_API_READ_POLICY,
    );

    expect(result).toEqual({
      ok: true,
      outcome: 'authenticated',
      principal: { userId: 'api-key-user', credential: 'apiKey' },
      permissions: ['read', 'write'],
      permission: 'read',
      client: mockServiceClient,
    });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('does not fall back to a valid cookie when an API key is rejected', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'cookie-user' } },
      error: null,
    });
    mockServiceSingle.mockResolvedValue({ data: null, error: null });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/tasks', {
        headers: {
          authorization: 'Bearer brm_rejected',
          cookie: 'session=valid-cookie',
        },
      }),
      USER_API_READ_POLICY,
    );

    expect(result).toEqual({
      ok: false,
      outcome: 'invalid',
      error: 'Invalid credentials',
      status: 401,
    });
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('falls back to a valid cookie for a non-API-key authorization header', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'cookie-user' } },
      error: null,
    });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/tasks', {
        headers: {
          authorization: 'Bearer unrelated-token',
          cookie: 'session=valid-cookie',
        },
      }),
      USER_API_READ_POLICY,
    );

    expect(result).toEqual({
      ok: true,
      outcome: 'authenticated',
      principal: { userId: 'cookie-user', credential: 'cookie' },
      permissions: ['read', 'write'],
      permission: 'read',
      client: mockCookieClient,
    });
    expect(mockServiceFrom).not.toHaveBeenCalled();
  });

  it('updates last_used_at after an API key is authorized', async () => {
    const { fullKey } = generateApiKey();
    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'api-key-user',
        permissions: 'read_write',
        expires_at: null,
      },
      error: null,
    });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/tasks', {
        headers: { authorization: `Bearer ${fullKey}` },
      }),
      USER_API_READ_POLICY,
    );
    await Promise.resolve();

    expect(result.ok).toBe(true);
    expect(mockServiceUpdate).toHaveBeenCalledTimes(1);
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      last_used_at: expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      ),
    });
    expect(mockServiceUpdateEq).toHaveBeenCalledTimes(1);
    expect(mockServiceUpdateEq).toHaveBeenCalledWith('id', 'key-1');
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('logs a last_used_at database error without failing authorization', async () => {
    const updateError = { code: '08006', message: 'connection failure' };
    const { fullKey } = generateApiKey();
    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'api-key-user',
        permissions: 'read_write',
        expires_at: null,
      },
      error: null,
    });
    mockServiceUpdateEq.mockResolvedValue({ error: updateError });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/tasks', {
        headers: { authorization: `Bearer ${fullKey}` },
      }),
      USER_API_READ_POLICY,
    );
    await Promise.resolve();

    expect(result.ok).toBe(true);
    expect(mockLogError).toHaveBeenCalledWith(
      '[api-key] Failed to update last_used_at',
      updateError,
    );
  });

  it('logs a last_used_at network error without failing authorization', async () => {
    const networkError = new Error('connection reset');
    const { fullKey } = generateApiKey();
    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'api-key-user',
        permissions: 'read_write',
        expires_at: null,
      },
      error: null,
    });
    mockServiceUpdateEq.mockRejectedValue(networkError);

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/tasks', {
        headers: { authorization: `Bearer ${fullKey}` },
      }),
      USER_API_READ_POLICY,
    );
    await Promise.resolve();

    expect(result.ok).toBe(true);
    expect(mockLogError).toHaveBeenCalledWith(
      '[api-key] Failed to update last_used_at (network)',
      networkError,
    );
  });

  it('logs a synchronous last_used_at setup failure without failing authorization', async () => {
    const setupError = new Error('update chain setup failed');
    const { fullKey } = generateApiKey();
    mockServiceSingle.mockResolvedValue({
      data: {
        id: 'key-1',
        user_id: 'api-key-user',
        permissions: 'read_write',
        expires_at: null,
      },
      error: null,
    });
    mockServiceUpdate.mockImplementation(() => {
      throw setupError;
    });

    const result = await authenticateRequest(
      new NextRequest('http://localhost:3000/api/tasks', {
        headers: { authorization: `Bearer ${fullKey}` },
      }),
      USER_API_READ_POLICY,
    );

    expect(result).toEqual({
      ok: true,
      outcome: 'authenticated',
      principal: { userId: 'api-key-user', credential: 'apiKey' },
      permissions: ['read', 'write'],
      permission: 'read',
      client: mockServiceClient,
    });
    expect(mockLogError).toHaveBeenCalledWith(
      '[api-key] Failed to update last_used_at (setup)',
      setupError,
    );
  });

  it('returns 401 for invalid API key (not found in DB)', async () => {
    mockServiceSingle.mockResolvedValue({ data: null, error: null });

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      headers: { authorization: 'Bearer brm_invalidkey1234567890abcdef' },
    });

    const result = await authenticateRequest(request, USER_API_READ_POLICY);

    expect(result).toEqual({
      ok: false,
      outcome: 'invalid',
      error: 'Invalid credentials',
      status: 401,
    });
  });

  it('returns 500 when API key DB lookup fails', async () => {
    mockServiceSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'DB error' } });

    const request = new NextRequest('http://localhost:3000/api/tasks', {
      headers: { authorization: 'Bearer brm_invalidkey1234567890abcdef' },
    });

    const result = await authenticateRequest(request, USER_API_READ_POLICY);

    expect(result).toEqual({
      ok: false,
      outcome: 'misconfigured',
      error: 'Server misconfigured',
      status: 500,
    });
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

    const result = await authenticateRequest(request, USER_API_READ_POLICY);

    expect(result).toEqual({
      ok: false,
      outcome: 'invalid',
      error: 'Invalid credentials',
      status: 401,
    });
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

    const result = await authenticateRequest(request, USER_API_WRITE_POLICY);

    expect(result).toEqual({
      ok: false,
      outcome: 'forbidden',
      error: 'Forbidden',
      status: 403,
    });
    expect(mockServiceUpdate).not.toHaveBeenCalled();
  });
});
