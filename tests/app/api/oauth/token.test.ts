// @vitest-environment node
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect });
const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });

// Mock for oauth_refresh_tokens insert
const mockInsert = vi.fn().mockResolvedValue({ error: null });

// Mock for oauth_refresh_tokens delete chain: .delete().or()
const mockOr = vi.fn().mockResolvedValue({ error: null });
const mockDelete = vi.fn().mockReturnValue({ or: mockOr });

// Mock for refresh token lookup: .select('*').eq().single()
const mockRtSingle = vi.fn();
const mockRtEq = vi.fn().mockReturnValue({ single: mockRtSingle });
const mockRtSelect = vi.fn().mockReturnValue({ eq: mockRtEq });

// Mock for refresh token update: supports both single and double .eq() chaining
// Reuse detection: .update().eq('user_id', ...) → { error: null }  (thenable)
// Atomic rotation: .update().eq('token_hash', ...).eq('revoked', false) → { error: null }
const mockRtUpdateEq2 = vi.fn().mockResolvedValue({ error: null });
const mockRtUpdateEq = vi.fn();
const mockRtUpdate = vi.fn().mockReturnValue({ eq: mockRtUpdateEq });

const mockServiceFrom = vi.fn().mockImplementation((table: string) => {
  if (table === 'oauth_refresh_tokens') {
    return {
      insert: mockInsert,
      delete: mockDelete,
      select: mockRtSelect,
      update: mockRtUpdate,
    };
  }
  // oauth_codes
  return { update: mockUpdate };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockServiceFrom }),
}));

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

function makeStoredCode(
  overrides: Record<string, unknown> = {},
  pkce = makePkce(),
) {
  const code = crypto.randomBytes(32).toString('hex');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  const stored = {
    code_hash: codeHash,
    user_id: 'user-123',
    code_challenge: pkce.codeChallenge,
    redirect_uri: REDIRECT_URI,
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    used: true, // after atomic update, used is always true
    ...overrides,
  };

  return { code, codeHash, stored, pkce };
}

function setupChain() {
  mockUpdate.mockReturnValue({ eq: mockEq1 });
  mockEq1.mockReturnValue({ eq: mockEq2 });
  mockEq2.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockResolvedValue({ error: null });
  mockDelete.mockReturnValue({ or: mockOr });
  mockOr.mockResolvedValue({ error: null });

  // Refresh token table chains
  mockRtSelect.mockReturnValue({ eq: mockRtEq });
  mockRtEq.mockReturnValue({ single: mockRtSingle });
  mockRtUpdate.mockReturnValue({ eq: mockRtUpdateEq });
  // mockRtUpdateEq returns a thenable+chainable object:
  // - .then() resolves { error: null } so `await ...eq('user_id', x)` works (reuse path)
  // - .eq property chains to mockRtUpdateEq2 for atomic rotation (.eq().eq())
  mockRtUpdateEq.mockImplementation(() => {
    const obj: { eq: typeof mockRtUpdateEq2; then?: (resolve: (v: unknown) => unknown) => unknown } = { eq: mockRtUpdateEq2 };
    obj.then = (resolve) => resolve({ error: null });
    return obj;
  });
  mockRtUpdateEq2.mockResolvedValue({ error: null });
}

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
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code: 'unknown-code',
      code_verifier: 'some-verifier',
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
  });

  it('returns invalid_grant for used code', async () => {
    // Atomic update with used=false filter returns no row for already-used code
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const { code, pkce } = makeStoredCode({ used: true });
    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
  });

  it('returns invalid_grant for expired code', async () => {
    const { code, pkce, stored } = makeStoredCode({
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    // Atomic update succeeds (code was unused) but it's expired
    mockSingle.mockResolvedValue({ data: stored, error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('expired');
  });

  it('returns invalid_grant for wrong redirect_uri', async () => {
    const { code, pkce, stored } = makeStoredCode();
    mockSingle.mockResolvedValue({ data: stored, error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: 'http://localhost:9999/wrong',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('redirect_uri');
  });

  it('returns invalid_grant for wrong code_verifier (PKCE)', async () => {
    const { code, stored } = makeStoredCode();
    mockSingle.mockResolvedValue({ data: stored, error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: 'wrong-verifier-that-does-not-match',
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('PKCE');
  });

  it('returns access_token for valid request', async () => {
    const { code, pkce, stored } = makeStoredCode();
    mockSingle.mockResolvedValue({ data: stored, error: null });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(typeof data.refresh_token).toBe('string');
    expect(data.refresh_token).toHaveLength(96);

    // Verify atomic claim was called
    expect(mockUpdate).toHaveBeenCalledWith({ used: true });

    // Verify refresh token was stored
    expect(mockServiceFrom).toHaveBeenCalledWith('oauth_refresh_tokens');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        token_hash: expect.any(String),
        expires_at: expect.any(String),
      }),
    );

    // Verify opportunistic cleanup was triggered
    expect(mockDelete).toHaveBeenCalled();
    expect(mockOr).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// grant_type=refresh_token tests
// ---------------------------------------------------------------------------

function makeStoredRefreshToken(overrides: Record<string, unknown> = {}) {
  return {
    token_hash: 'some-hash',
    user_id: 'user-123',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    revoked: false,
    replaced_by_hash: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
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
    expect(data.error_description).toContain('refresh_token');
  });

  it('returns invalid_grant for unknown refresh token', async () => {
    mockRtSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

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
    mockRtSingle.mockResolvedValue({ data: stored, error: null });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'some-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('expired');
  });

  it('returns invalid_grant for revoked refresh token', async () => {
    const stored = makeStoredRefreshToken({ revoked: true });
    mockRtSingle.mockResolvedValue({ data: stored, error: null });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'some-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('revoked');
  });

  it('returns invalid_grant and revokes all user tokens on reuse detection', async () => {
    const stored = makeStoredRefreshToken({ replaced_by_hash: 'already-rotated-hash' });
    mockRtSingle.mockResolvedValue({ data: stored, error: null });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'reused-raw-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('reuse');

    // Should have called update to revoke ALL tokens for the user
    expect(mockRtUpdate).toHaveBeenCalledWith({ revoked: true });
    expect(mockRtUpdateEq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('returns new access_token and rotated refresh_token for a valid token', async () => {
    const stored = makeStoredRefreshToken();
    mockRtSingle.mockResolvedValue({ data: stored, error: null });

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

    // New token should be inserted FIRST (before old is marked replaced)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        token_hash: expect.any(String),
        expires_at: expect.any(String),
      }),
    );

    // Old token should be atomically marked replaced + revoked (two .eq() calls)
    expect(mockRtUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ revoked: true, replaced_by_hash: expect.any(String) }),
    );
    expect(mockRtUpdateEq).toHaveBeenCalledWith('token_hash', expect.any(String));
    expect(mockRtUpdateEq2).toHaveBeenCalledWith('revoked', false);

    // Cleanup should run
    expect(mockDelete).toHaveBeenCalled();
    expect(mockOr).toHaveBeenCalled();
  });
});
