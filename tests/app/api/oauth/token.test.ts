// @vitest-environment node
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { hashToken } from '@/lib/mcp/refresh-token';
import { issueAccessToken } from '@/lib/oauth/access-token';
import { log } from '@/lib/logger';
import { queueThenResponses, restoreMockSupabaseThen } from '../../../helpers/mock-supabase';
import { mockSupabaseClient } from '../../../setup';

// Set env vars before import
process.env.API_KEY_HMAC_SECRET = 'test-secret-for-mcp-token-tests-32chars';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock the shared access-token policy boundary.
vi.mock('@/lib/oauth/access-token', () => ({
  issueAccessToken: vi.fn().mockResolvedValue({
    accessToken: 'mock-access-token',
    tokenType: 'bearer',
    expiresIn: 3600,
    scope: 'read write',
  }),
}));

// Mock Supabase service client — chain: .update().eq().eq().select().single()
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

// Mock for oauth_refresh_tokens insert

// Mock for oauth_refresh_tokens delete chain: .delete().or() and .delete().eq()

// Mock for refresh token lookup: .select('*').eq().single()

// Mock for refresh token update: supports both single and double .eq() chaining
// Reuse detection: .update().eq('user_id', ...) → { error: null }  (thenable)
// Atomic rotation: .update().eq('token_hash', ...).eq('revoked', false).select('id') → { data, error }

vi.mock('@supabase/supabase-js', async () => {
  const { mockSupabaseClient: client } = await import('../../../setup');
  return {
    createClient: () => ({ from: client.from, rpc: mockRpc }),
  };
});

import { POST } from '@/app/api/oauth/token/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePkce() {
  const codeVerifier = crypto.randomBytes(32).toString('hex');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

function makeRequest(body: Record<string, string>): NextRequest {
  const params = new URLSearchParams(body);
  return new NextRequest('http://localhost:3000/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

const REDIRECT_URI = 'http://localhost:3000/callback';
const NOW = new Date('2026-07-28T20:00:00.000Z');

function makeStoredCode(
  overrides: Record<string, unknown> = {},
  pkce = makePkce(),
) {
  const code = crypto.randomBytes(32).toString('hex');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  const stored = {
    outcome: 'consumed',
    code_hash: codeHash,
    client_id: 'test-client',
    user_id: 'user-123',
    scopes: ['read', 'write'],
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: REDIRECT_URI,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    used: true, // after atomic update, used is always true
    ...overrides,
  };

  return { code, codeHash, stored, pkce };
}

function setupChain() {
  mockSupabaseClient.setMockResponse(null, null);
  mockRpc.mockResolvedValue({ data: [{ outcome: 'invalid_code' }], error: null });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  restoreMockSupabaseThen();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/oauth/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
  });

  it('returns error for missing grant_type', async () => {
    const request = makeRequest({
      code: 'some-code',
      code_verifier: 'some-verifier',
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('unsupported_grant_type');
  });

  it('returns error for invalid grant_type', async () => {
    const request = makeRequest({
      grant_type: 'client_credentials',
      code: 'some-code',
      code_verifier: 'some-verifier',
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('unsupported_grant_type');
  });

  it('returns invalid_grant for unknown code', async () => {
    // Atomic update returns no row (code not found or already used)
    mockRpc.mockResolvedValue({ data: [{ outcome: 'invalid_code' }], error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code: 'unknown-code',
      code_verifier: 'some-verifier',
      redirect_uri: REDIRECT_URI,
      client_id: 'test-client',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
  });

  it('returns invalid_grant for used code', async () => {
    // Atomic update with used=false filter returns no row for already-used code
    mockRpc.mockResolvedValue({ data: [{ outcome: 'reused_code' }], error: null });

    const { code, pkce } = makeStoredCode({ used: true });
    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: 'test-client',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
  });

  it('returns invalid_grant for expired code', async () => {
    const { code, pkce } = makeStoredCode({
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    // Atomic update succeeds (code was unused) but it's expired
    mockRpc.mockResolvedValue({ data: [{ outcome: 'expired_code' }], error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: 'test-client',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toBe('expired_code');
  });

  it('returns invalid_grant for wrong redirect_uri', async () => {
    const { code, pkce } = makeStoredCode();
    mockRpc.mockResolvedValue({ data: [{ outcome: 'mismatched_code' }], error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: 'http://localhost:9999/wrong',
      client_id: 'test-client',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toBe('mismatched_code');
  });

  it('returns invalid_grant for wrong code_verifier (PKCE)', async () => {
    const { code } = makeStoredCode();
    mockRpc.mockResolvedValue({ data: [{ outcome: 'mismatched_code' }], error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: 'wrong-verifier-that-does-not-match',
      redirect_uri: REDIRECT_URI,
      client_id: 'test-client',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toBe('mismatched_code');
  });

  it('returns access_token for valid request', async () => {
    const { code, codeHash, pkce, stored } = makeStoredCode();
    mockRpc.mockResolvedValue({ data: [stored], error: null });
    const rawRefreshToken = 'ab'.repeat(48);
    const randomBytes = vi.spyOn(crypto, 'randomBytes').mockImplementation(
      ((size: number) => Buffer.alloc(size, 0xab)) as typeof crypto.randomBytes,
    );

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: 'test-client',
    });
    const response = await POST(request);
    randomBytes.mockRestore();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(data.refresh_token).toBe(rawRefreshToken);

    // Verify atomic lifecycle consumption was called
    expect(mockRpc).toHaveBeenCalledWith(
      'consume_oauth_authorization_code',
      {
        requested_code_hash: codeHash,
        requested_client_id: 'test-client',
        requested_redirect_uri: REDIRECT_URI,
        requested_code_challenge: pkce.codeChallenge,
        requested_code_challenge_method: 'S256',
        requested_at: NOW.toISOString(),
      },
    );

    expect(mockSupabaseClient.queryLog).toEqual([
      { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
      {
        table: 'oauth_refresh_tokens',
        method: 'insert',
        args: [{
          user_id: 'user-123',
          client_id: 'test-client',
          scopes: ['read', 'write'],
          token_hash:
            '6a6d77bf81726016010757422ea814316f64420f2f6852ef29568c80876918b3',
          expires_at: '2027-01-24T20:00:00.000Z',
        }],
      },
    ]);
    expect(mockRpc).toHaveBeenCalledWith(
      'cleanup_oauth_refresh_token_families',
      {
        expired_before: '2026-07-27T20:00:00.000Z',
        revoked_before: '2026-07-21T20:00:00.000Z',
      },
    );
  });

  it('returns server_error without credentials when refresh-token insertion fails', async () => {
    const { code, pkce, stored } = makeStoredCode();
    mockRpc.mockResolvedValue({ data: [stored], error: null });
    queueThenResponses([
      { data: null, error: { message: 'refresh-token insert failed' } },
    ]);
    const randomBytes = vi.spyOn(crypto, 'randomBytes').mockImplementation(
      ((size: number) => Buffer.alloc(size, 0xcd)) as typeof crypto.randomBytes,
    );

    const response = await POST(makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: 'test-client',
    }));
    randomBytes.mockRestore();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'server_error',
      error_description: 'Internal server error',
    });
    expect(mockSupabaseClient.queryLog).toEqual([
      { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
      {
        table: 'oauth_refresh_tokens',
        method: 'insert',
        args: [{
          token_hash: hashToken('cd'.repeat(48)),
          client_id: 'test-client',
          user_id: 'user-123',
          scopes: ['read', 'write'],
          expires_at: '2027-01-24T20:00:00.000Z',
        }],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// grant_type=refresh_token tests
// ---------------------------------------------------------------------------

describe('POST /api/oauth/token — grant_type=refresh_token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
  });

  it('returns invalid_request when refresh_token param is missing', async () => {
    const request = makeRequest({
      grant_type: 'refresh_token',
      client_id: 'test-client',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_request');
    expect(data.error_description).toBe('refresh_token is required');
  });

  it('returns invalid_request when client_id context is missing', async () => {
    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'some-raw-token',
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_request',
      error_description: 'client_id is required',
    });
  });

  it.each([
    ['refresh_token', '', 'refresh_token is required'],
    ['client_id', '', 'client_id is required'],
  ])(
    'returns invalid_request when %s is empty',
    async (field, value, description) => {
      const response = await POST(makeRequest({
        grant_type: 'refresh_token',
        refresh_token: 'some-raw-token',
        client_id: 'test-client',
        [field]: value,
      }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'invalid_request',
        error_description: description,
      });
      expect(mockRpc).not.toHaveBeenCalled();
      expect(issueAccessToken).not.toHaveBeenCalled();
      expect(mockSupabaseClient.queryLog).toEqual([]);
    },
  );

  it('rotates a valid token through one atomic lifecycle operation', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        outcome: 'valid_token',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockResolvedValueOnce({
      data: [{
        outcome: 'rotated',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const rawRefreshToken = 'ef'.repeat(48);
    const randomBytes = vi.spyOn(crypto, 'randomBytes').mockImplementation(
      ((size: number) => Buffer.alloc(size, 0xef)) as typeof crypto.randomBytes,
    );

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'valid-raw-token',
      client_id: 'test-client',
    }));
    randomBytes.mockRestore();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.refresh_token).toBe(rawRefreshToken);
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(data.scope).toBe('read write');
    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'resolve_oauth_refresh_token_context',
      {
        requested_token_hash: hashToken('valid-raw-token'),
        requested_client_id: 'test-client',
        requested_at: NOW.toISOString(),
      },
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'rotate_oauth_refresh_token',
      {
        requested_token_hash: hashToken('valid-raw-token'),
        replacement_token_hash:
          '451541b7fec3361c8ffe8ff45487c7b66468b3e7f95f40e46d57beac608d45ef',
        replacement_expires_at: '2027-01-24T20:00:00.000Z',
        requested_client_id: 'test-client',
        requested_at: NOW.toISOString(),
      },
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      3,
      'cleanup_oauth_refresh_token_families',
      {
        expired_before: '2026-07-27T20:00:00.000Z',
        revoked_before: '2026-07-21T20:00:00.000Z',
      },
    );
  });

  it('returns credentials when cleanup fails and logs the warning', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        outcome: 'valid_token',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockResolvedValueOnce({
      data: [{
        outcome: 'rotated',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockResolvedValueOnce({
      data: null,
      error: new Error('cleanup unavailable'),
    });
    const randomBytes = vi.spyOn(crypto, 'randomBytes').mockImplementation(
      ((size: number) => Buffer.alloc(size, 0x12)) as typeof crypto.randomBytes,
    );

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'valid-raw-token',
      client_id: 'test-client',
    }));
    randomBytes.mockRestore();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: '12'.repeat(48),
      scope: 'read write',
    });
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      '[oauth] Refresh token cleanup failed',
      { error: 'Error: cleanup unavailable' },
    );
  });

  it('returns credentials when the cleanup RPC rejects and logs the warning', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        outcome: 'valid_token',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockResolvedValueOnce({
      data: [{
        outcome: 'rotated',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockRejectedValueOnce(new Error('cleanup rejected'));
    const randomBytes = vi.spyOn(crypto, 'randomBytes').mockImplementation(
      ((size: number) => Buffer.alloc(size, 0x34)) as typeof crypto.randomBytes,
    );

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'valid-raw-token',
      client_id: 'test-client',
    }));
    randomBytes.mockRestore();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: '34'.repeat(48),
      scope: 'read write',
    });
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      '[oauth] Refresh token cleanup failed',
      { error: 'Error: cleanup rejected' },
    );
  });

  it.each([
    ['invalid_token', 'Invalid refresh token'],
    ['expired_token', 'Refresh token expired'],
    ['mismatched_context', 'Refresh token context mismatch'],
    ['revoked_token', 'Refresh token revoked'],
  ])('issues no credentials for a %s outcome', async (outcome, description) => {
    mockRpc.mockResolvedValue({ data: [{ outcome }], error: null });

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'unusable-token',
      client_id: 'test-client',
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_grant',
      error_description: description,
    });
    expect(issueAccessToken).not.toHaveBeenCalled();
    expect(mockSupabaseClient.queryLog).toEqual([]);
  });

  it('returns the family-level response when reuse is detected', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ outcome: 'reused_token' }],
      error: null,
    }).mockResolvedValueOnce({
      data: [{ outcome: 'reused_token' }],
      error: null,
    });
    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'reused-token',
      client_id: 'test-client',
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_grant',
      error_description: 'Token reuse detected — token family revoked',
    });
    expect(issueAccessToken).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      'resolve_oauth_refresh_token_context',
      {
        requested_token_hash: hashToken('reused-token'),
        requested_client_id: 'test-client',
        requested_at: NOW.toISOString(),
      },
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      'rotate_oauth_refresh_token',
      {
        requested_token_hash: hashToken('reused-token'),
        replacement_token_hash: '0'.repeat(64),
        replacement_expires_at: '2027-01-24T20:00:00.000Z',
        requested_client_id: 'test-client',
        requested_at: NOW.toISOString(),
      },
    );
  });

  it('returns the family-level response when atomic rotation detects concurrent reuse', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        outcome: 'valid_token',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockResolvedValueOnce({
      data: [{ outcome: 'reused_token' }],
      error: null,
    });

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'concurrently-reused-token',
      client_id: 'test-client',
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_grant',
      error_description: 'Token reuse detected — token family revoked',
    });
    expect(issueAccessToken).toHaveBeenCalledOnce();
    expect(issueAccessToken).toHaveBeenCalledWith({
      userId: 'user-123',
      clientId: 'test-client',
      scopes: ['read', 'write'],
    });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).not.toHaveBeenCalledWith(
      'cleanup_oauth_refresh_token_families',
      expect.anything(),
    );
  });

  it('returns server_error without credentials when atomic rotation fails', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{
        outcome: 'valid_token',
        client_id: 'test-client',
        user_id: 'user-123',
        scopes: ['read', 'write'],
      }],
      error: null,
    }).mockResolvedValueOnce({
      data: null,
      error: new Error('database unavailable'),
    });

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'valid-token',
      client_id: 'test-client',
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'server_error',
      error_description: 'Internal server error',
    });
    expect(issueAccessToken).toHaveBeenCalledOnce();
    expect(issueAccessToken).toHaveBeenCalledWith({
      userId: 'user-123',
      clientId: 'test-client',
      scopes: ['read', 'write'],
    });
  });
});
