// @vitest-environment node
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { hashToken } from '@/lib/mcp/refresh-token';
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

// Mock signMcpToken to return a predictable value
vi.mock('@/lib/mcp/token', () => ({
  signMcpToken: vi.fn().mockResolvedValue('mock-access-token'),
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

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
      client_id: 'test-client',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(typeof data.refresh_token).toBe('string');
    expect(data.refresh_token).toHaveLength(96);

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
          token_hash: hashToken(data.refresh_token),
          expires_at: '2027-01-24T20:00:00.000Z',
        }],
      },
      { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
      { table: 'oauth_refresh_tokens', method: 'delete', args: [] },
      {
        table: 'oauth_refresh_tokens',
        method: 'or',
        args: ['expires_at.lt.2026-07-27T20:00:00.000Z,and(revoked.eq.true,created_at.lt.2026-07-21T20:00:00.000Z)'],
      },
    ]);
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

function makeStoredRefreshToken(overrides: Record<string, unknown> = {}) {
  return {
    token_hash: 'some-hash',
    client_id: 'test-client',
    user_id: 'user-123',
    scopes: ['read', 'write'],
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    revoked: false,
    replaced_by_hash: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function refreshLookupQueries(rawToken: string) {
  return [
    { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
    { table: 'oauth_refresh_tokens', method: 'select', args: ['*'] },
    { table: 'oauth_refresh_tokens', method: 'eq', args: ['token_hash', hashToken(rawToken)] },
    { table: 'oauth_refresh_tokens', method: 'single', args: [] },
  ];
}

function successfulRotationQueries({
  rawToken,
  newRawToken,
  clientId,
}: {
  rawToken: string;
  newRawToken: string;
  clientId: string;
}) {
  const oldTokenHash = hashToken(rawToken);
  const newTokenHash = hashToken(newRawToken);
  return [
    ...refreshLookupQueries(rawToken),
    { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
    {
      table: 'oauth_refresh_tokens',
      method: 'insert',
      args: [{
        token_hash: newTokenHash,
        client_id: clientId,
        user_id: 'user-123',
        scopes: ['read', 'write'],
        expires_at: '2027-01-24T20:00:00.000Z',
      }],
    },
    { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
    {
      table: 'oauth_refresh_tokens',
      method: 'update',
      args: [{ revoked: true, replaced_by_hash: newTokenHash }],
    },
    { table: 'oauth_refresh_tokens', method: 'eq', args: ['token_hash', oldTokenHash] },
    { table: 'oauth_refresh_tokens', method: 'eq', args: ['revoked', false] },
    { table: 'oauth_refresh_tokens', method: 'select', args: ['id'] },
    { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
    { table: 'oauth_refresh_tokens', method: 'delete', args: [] },
    {
      table: 'oauth_refresh_tokens',
      method: 'or',
      args: ['expires_at.lt.2026-07-27T20:00:00.000Z,and(revoked.eq.true,created_at.lt.2026-07-21T20:00:00.000Z)'],
    },
  ];
}

describe('POST /api/oauth/token — grant_type=refresh_token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupChain();
  });

  it('returns invalid_request when refresh_token param is missing', async () => {
    const request = makeRequest({ grant_type: 'refresh_token' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_request');
    expect(data.error_description).toBe('refresh_token is required');
  });

  it('returns invalid_grant for unknown refresh token', async () => {
    mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'unknown-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
  });

  it('returns invalid_grant for expired refresh token', async () => {
    const stored = makeStoredRefreshToken({
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    mockSupabaseClient.setMockResponse(stored, null);

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'some-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toBe('Refresh token expired');
  });

  it('returns invalid_grant for revoked refresh token', async () => {
    const stored = makeStoredRefreshToken({ revoked: true });
    mockSupabaseClient.setMockResponse(stored, null);

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'some-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toBe('Refresh token revoked');
  });

  it('returns invalid_grant and revokes all user tokens on reuse detection', async () => {
    const stored = makeStoredRefreshToken({ replaced_by_hash: 'already-rotated-hash' });
    mockSupabaseClient.setMockResponse(stored, null);
    queueThenResponses([{ data: null, error: null }]);

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'reused-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toBe('Token reuse detected — all sessions revoked');

    expect(mockSupabaseClient.queryLog).toEqual([
      ...refreshLookupQueries('reused-raw-token'),
      { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
      { table: 'oauth_refresh_tokens', method: 'update', args: [{ revoked: true }] },
      { table: 'oauth_refresh_tokens', method: 'eq', args: ['user_id', 'user-123'] },
    ]);
  });

  it('returns new access_token and rotated refresh_token for a valid token', async () => {
    const stored = makeStoredRefreshToken();
    mockSupabaseClient.setMockResponse(stored, null);
    queueThenResponses([
      { data: null, error: null },
      { data: [{ id: 'row-1' }], error: null },
      { data: null, error: null },
    ]);

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'valid-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(typeof data.refresh_token).toBe('string');
    expect(data.refresh_token).toHaveLength(96);

    expect(mockSupabaseClient.queryLog).toEqual(successfulRotationQueries({
      rawToken: 'valid-raw-token',
      newRawToken: data.refresh_token,
      clientId: 'test-client',
    }));
  });

  it('preserves the legacy user-bound client identity during refresh rotation', async () => {
    mockSupabaseClient.setMockResponse(
      makeStoredRefreshToken({ client_id: '' }),
      null,
    );
    queueThenResponses([
      { data: null, error: null },
      { data: [{ id: 'row-1' }], error: null },
      { data: null, error: null },
    ]);

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'legacy-raw-token',
    }));

    const data = await response.json();
    expect(response.status).toBe(200);
    expect(mockSupabaseClient.queryLog).toEqual(successfulRotationQueries({
      rawToken: 'legacy-raw-token',
      newRawToken: data.refresh_token,
      clientId: 'user-123',
    }));
  });

  it('returns server_error without revoking the old token when rotation insert fails', async () => {
    mockSupabaseClient.setMockResponse(makeStoredRefreshToken(), null);
    queueThenResponses([{ data: null, error: { message: 'insert failed' } }]);
    const randomBytes = vi.spyOn(crypto, 'randomBytes').mockImplementation(
      ((size: number) => Buffer.alloc(size, 0xab)) as typeof crypto.randomBytes,
    );

    const response = await POST(makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'valid-raw-token',
    }));
    randomBytes.mockRestore();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'server_error',
      error_description: 'Token rotation failed',
    });
    expect(mockSupabaseClient.queryLog).toEqual([
      ...refreshLookupQueries('valid-raw-token'),
      { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
      {
        table: 'oauth_refresh_tokens',
        method: 'insert',
        args: [{
          token_hash: hashToken('ab'.repeat(48)),
          client_id: 'test-client',
          user_id: 'user-123',
          scopes: ['read', 'write'],
          expires_at: '2027-01-24T20:00:00.000Z',
        }],
      },
    ]);
  });

  it('returns 401 and rolls back new token when atomic revoke claims zero rows (concurrent race)', async () => {
    const stored = makeStoredRefreshToken();
    mockSupabaseClient.setMockResponse(stored, null);

    // Simulate concurrent request already claimed the token — revoke update returns 0 rows
    queueThenResponses([
      { data: null, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ]);

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'valid-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toBe('Token already consumed');
    const insert = mockSupabaseClient.queryLog.find(
      ({ method }) => method === 'insert',
    );
    const insertedHash = (insert?.args[0] as { token_hash: string }).token_hash;
    expect(mockSupabaseClient.queryLog.slice(-3)).toEqual([
      { table: 'oauth_refresh_tokens', method: 'from', args: ['oauth_refresh_tokens'] },
      { table: 'oauth_refresh_tokens', method: 'delete', args: [] },
      { table: 'oauth_refresh_tokens', method: 'eq', args: ['token_hash', insertedHash] },
    ]);
  });
});
