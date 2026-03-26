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

// Mock Supabase service client
const mockSingle = vi.fn();
const mockEqForSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelectStar = vi.fn().mockReturnValue({ eq: mockEqForSelect });

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

const mockServiceFrom = vi.fn().mockReturnValue({
  select: mockSelectStar,
  update: mockUpdate,
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockServiceFrom }),
}));

import { POST } from '@/app/api/oauth/token/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a PKCE code_verifier and code_challenge pair. */
function makePkce() {
  const codeVerifier = crypto.randomBytes(32).toString('hex');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/** Builds a form-encoded POST request. */
function makeRequest(body: Record<string, string>): NextRequest {
  const params = new URLSearchParams(body);
  return new NextRequest('http://localhost:3000/api/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

const REDIRECT_URI = 'http://localhost:3000/callback';

/** Creates a stored code record for mocking the DB lookup. */
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
    used: false,
    ...overrides,
  };

  return { code, codeHash, stored, pkce };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/oauth/token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServiceFrom.mockReturnValue({
      select: mockSelectStar,
      update: mockUpdate,
    });
    mockSelectStar.mockReturnValue({ eq: mockEqForSelect });
    mockEqForSelect.mockReturnValue({ single: mockSingle });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockUpdateEq.mockResolvedValue({ error: null });
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
    expect(data.error_description).toContain('not found');
  });

  it('returns invalid_grant for used code', async () => {
    const { code, pkce, stored } = makeStoredCode({ used: true });
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
    expect(data.error_description).toContain('already used');
  });

  it('returns invalid_grant for expired code', async () => {
    const { code, pkce, stored } = makeStoredCode({
      expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
    });
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
    expect(data.expires_in).toBe(86400);

    // Verify code was marked as used
    expect(mockUpdate).toHaveBeenCalledWith({ used: true });
  });
});
